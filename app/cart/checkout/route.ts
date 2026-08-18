import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notifyAdminOfOrder } from '@/lib/webhook'

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
      const url = new URL('/cart', request.url)
      url.searchParams.set('error', '決済が拒否されました。カード情報をご確認のうえ、もう一度お試しください')
      return NextResponse.redirect(url)
    }
  }

  const { data: orderId, error } = await supabase.rpc('place_order', {
    p_payment_method: paymentMethod,
  })
  if (error) {
    const url = new URL('/cart', request.url)
    url.searchParams.set('error', error.message)
    return NextResponse.redirect(url)
  }

  await notifyAdminOrderPlaced(supabase, orderId, userData.user, paymentMethod)

  return NextResponse.redirect(new URL(`/orders/${orderId}`, request.url))
}

// 注文確定後の通知データ収集をルートハンドラ本体から分離したもの。
// 取得に失敗しても注文確定自体は成立済みのため、例外を投げず諦める。
async function notifyAdminOrderPlaced(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  orderId: string,
  user: { id: string; email?: string },
  paymentMethod: string
) {
  try {
    const [{ data: orderRow }, { data: profile }] = await Promise.all([
      supabase
        .from('orders')
        .select('total_cents, order_items(quantity, price_cents_at_order, products(name))')
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
  } catch (err) {
    console.error('注文Webhook通知用データの取得に失敗しました', err)
  }
}
