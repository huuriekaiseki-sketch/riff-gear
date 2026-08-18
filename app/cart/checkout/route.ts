import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notifyAdminOfOrder } from '@/lib/webhook'

const PAYMENT_METHODS = ['card', 'bank_transfer', 'cod'] as const

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
