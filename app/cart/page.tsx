import { createServerSupabaseClient } from '@/lib/supabase/server'
import { removeFromCart } from './actions'

// カートページ。ログインユーザーのカート明細を商品情報とJOINして表示し、
// 合計金額の計算と各明細の削除フォームを提供する。
export default async function CartPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return <p>カートを見るにはログインしてください。</p>
  }

  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (!cart) {
    return <p>カートは空です。</p>
  }

  const { data: items } = await supabase
    .from('cart_items')
    .select('id, quantity, products(name, price_cents)')
    .eq('cart_id', cart.id)

  const total = (items ?? []).reduce(
    (sum, item: any) => sum + item.quantity * item.products.price_cents,
    0
  )

  return (
    <main>
      <h1>カート</h1>
      <ul>
        {items?.map((item: any) => (
          <li key={item.id}>
            {item.products.name} × {item.quantity} = ¥
            {(item.products.price_cents * item.quantity).toLocaleString()}
            <form action={removeFromCart}>
              <input type="hidden" name="itemId" value={item.id} />
              <button type="submit">削除</button>
            </form>
          </li>
        ))}
      </ul>
      <p>合計: ¥{total.toLocaleString()}</p>
      <form action="/cart/checkout" method="post">
        <button type="submit" disabled={!items?.length}>
          注文する
        </button>
      </form>
    </main>
  )
}
