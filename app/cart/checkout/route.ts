import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

  return NextResponse.redirect(new URL(`/orders/${orderId}`, request.url))
}
