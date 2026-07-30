import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// カートの内容を注文として確定するルートハンドラ。
// 未ログインならログインページへ、place_order失敗時はカートページへエラー付きでリダイレクトする。
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: orderId, error } = await supabase.rpc('place_order')
  if (error) {
    const url = new URL('/cart', request.url)
    url.searchParams.set('error', error.message)
    return NextResponse.redirect(url)
  }

  return NextResponse.redirect(new URL(`/orders/${orderId}`, request.url))
}
