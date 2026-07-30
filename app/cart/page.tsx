import { createServerSupabaseClient } from '@/lib/supabase/server'
import { removeFromCart } from './actions'

// カートページ。ログインユーザーのカート明細を商品情報とJOINして表示し、
// 合計金額の計算と各明細の削除フォームを提供する。
export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: errorMessage } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return <p className="text-gray-500 dark:text-gray-400">カートを見るにはログインしてください。</p>
  }

  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (!cart) {
    return <p className="text-gray-500 dark:text-gray-400">カートは空です。</p>
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
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">カート</h1>
      {errorMessage && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <ul className="mt-6 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-surface shadow-sm dark:divide-gray-800 dark:border-gray-800">
        {items?.map((item: any) => (
          <li key={item.id} className="flex items-center justify-between gap-4 px-6 py-4">
            <div>
              <p className="font-medium text-foreground">{item.products.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                × {item.quantity} = ¥
                {(item.products.price_cents * item.quantity).toLocaleString()}
              </p>
            </div>
            <form action={removeFromCart}>
              <input type="hidden" name="itemId" value={item.id} />
              <button
                type="submit"
                className="rounded-full border border-gray-300 px-3 py-1 text-sm font-medium text-gray-600 transition-colors hover:border-danger hover:text-danger dark:border-gray-700 dark:text-gray-300"
              >
                削除
              </button>
            </form>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
        <p className="text-lg font-semibold text-foreground">合計: ¥{total.toLocaleString()}</p>
        <form action="/cart/checkout" method="post">
          <button
            type="submit"
            disabled={!items?.length}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            注文する
          </button>
        </form>
      </div>
    </main>
  )
}
