import { NextResponse, type NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getLowStockThreshold, notifyAdminOfLowStock, notifyAdminOfOrder } from '@/lib/webhook'
import { logger, newRequestId } from '@/lib/logger'

const PAYMENT_METHODS = ['card', 'bank_transfer', 'cod', 'convenience_store', 'qr_code'] as const
const INSTANT_PAYMENT_METHODS: (typeof PAYMENT_METHODS)[number][] = ['card', 'qr_code']
const DUMMY_DECLINE_RATE = 0.1

// カード/QRコード決済のみ、決済ゲートウェイっぽい処理時間と拒否をダミーで再現する。
// 在庫を減らすplace_order呼び出しより前に行うため、拒否時は在庫・注文に一切影響しない。
async function simulateInstantPaymentGateway(): Promise<{ declined: boolean }> {
  await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 400))
  return { declined: Math.random() < DUMMY_DECLINE_RATE }
}

// カートの内容を注文として確定するルートハンドラ。
// 未ログインならログインページへ、place_order失敗時はカートページへエラー付きでリダイレクトする。
export async function POST(request: NextRequest) {
  // このリクエスト全体を通して使うID。構造化ログ・Sentryイベント・Slack通知の
  // 3箇所に含めることで、障害発生時に1つのIDで横断的に追跡できるようにする。
  const requestId = newRequestId()

  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const formData = await request.formData()
  const paymentMethod = formData.get('payment_method')
  if (typeof paymentMethod !== 'string' || !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    const url = new URL('/cart', request.url)
    url.searchParams.set('error', '支払い方法を選択してください')
    return NextResponse.redirect(url)
  }

  if (INSTANT_PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    const { declined } = await simulateInstantPaymentGateway()
    if (declined) {
      // ダミー決済ゲートウェイの拒否は想定内の業務イベントであり、バグではない。
      // Sentryには送らず、構造化ログにのみ記録する(errorではなくwarn)。
      logger.warn('決済が拒否されました', { requestId, userId: userData.user.id, paymentMethod })
      const url = new URL('/cart', request.url)
      url.searchParams.set('error', '決済が拒否されました。カード情報をご確認のうえ、もう一度お試しください')
      return NextResponse.redirect(url)
    }
  }

  // クーポンコードは未入力なら null として渡す（place_order側で未指定=適用なしと扱う）。
  // 前後の空白のみのトリムであり、値そのものの妥当性チェックはDB側（RLS+関数内検証）に委ねる。
  const rawCouponCode = formData.get('coupon_code')
  const couponCode = typeof rawCouponCode === 'string' && rawCouponCode.trim() !== '' ? rawCouponCode.trim() : null

  // フォーム側(CheckoutForm)がページ読み込み時に1回だけ生成したUUID。
  // 二重クリック・戻る+再送信で同じキーのまま2回POSTされても、place_order側で
  // 冪等に処理される(1回分の注文にしかならない)。
  const rawIdempotencyKey = formData.get('idempotency_key')
  const idempotencyKey = typeof rawIdempotencyKey === 'string' && rawIdempotencyKey !== '' ? rawIdempotencyKey : null

  const { data: orderId, error } = await supabase.rpc('place_order', {
    p_payment_method: paymentMethod,
    p_coupon_code: couponCode,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    // place_order()が返すエラー(在庫不足・無効なクーポン等)は業務ルール上の
    // 想定内の失敗であり、Sentryに送るべき「バグ」ではない。構造化ログにのみ記録する。
    logger.warn('place_order失敗', { requestId, userId: userData.user.id, message: error.message })
    const url = new URL('/cart', request.url)
    url.searchParams.set('error', error.message)
    return NextResponse.redirect(url)
  }

  logger.info('注文が確定しました', { requestId, orderId, userId: userData.user.id })
  await notifyAdminOrderPlaced(supabase, orderId, userData.user, paymentMethod, requestId)

  return NextResponse.redirect(new URL(`/orders/${orderId}`, request.url))
}

// 注文確定後の通知データ収集をルートハンドラ本体から分離したもの。
// 取得に失敗しても注文確定自体は成立済みのため、例外を投げず諦める。
async function notifyAdminOrderPlaced(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  orderId: string,
  user: { id: string; email?: string },
  paymentMethod: string,
  requestId: string
) {
  try {
    const [{ data: orderRow }, { data: profile }] = await Promise.all([
      supabase
        .from('orders')
        .select('total_cents, order_items(quantity, price_cents_at_order, products(name, stock))')
        .eq('id', orderId)
        .single(),
      supabase
        .from('profiles')
        .select('display_name, postal_code, address, phone')
        .eq('id', user.id)
        .single(),
    ])

    await notifyAdminOfOrder({
      orderId,
      requestId,
      userId: user.id,
      userEmail: user.email ?? null,
      displayName: profile?.display_name ?? null,
      postalCode: profile?.postal_code ?? null,
      address: profile?.address ?? null,
      phone: profile?.phone ?? null,
      totalCents: orderRow?.total_cents ?? 0,
      paymentMethod,
      items: (orderRow?.order_items ?? []).map((item) => {
        const product = Array.isArray(item.products) ? item.products[0] : item.products
        return {
          productName: (product as { name: string } | null)?.name ?? '不明な商品',
          quantity: item.quantity,
          priceCentsAtOrder: item.price_cents_at_order,
        }
      }),
    })

    const threshold = getLowStockThreshold()
    const lowStockItems = (orderRow?.order_items ?? [])
      .map((item) => (Array.isArray(item.products) ? item.products[0] : item.products) as { name: string; stock: number } | null)
      .filter((product): product is { name: string; stock: number } => product !== null && product.stock <= threshold)
      .map((product) => ({ productName: product.name, stock: product.stock }))

    await notifyAdminOfLowStock(lowStockItems)
  } catch (err) {
    // ここは「注文は成立したのに、通知用データの取得だけが失敗した」という
    // 想定外の状態(DB読み取り異常等)であり、業務ルールの失敗ではない。
    // 構造化ログに加えてSentryにも送り、後で気づけるようにする。
    logger.error('注文Webhook通知用データの取得に失敗しました', {
      requestId,
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
    Sentry.captureException(err, { tags: { requestId, orderId } })
  }
}
