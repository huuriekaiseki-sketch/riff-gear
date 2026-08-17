import { createServerSupabaseClient } from '@/lib/supabase/server'
import { removeFromCart } from './actions'

type CartItemRow = {
  id: string
  quantity: number
  products: { name: string; price_cents: number }
}

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

  const { data: items } = (await supabase
    .from('cart_items')
    .select('id, quantity, products(name, price_cents)')
    .eq('cart_id', cart.id)) as { data: CartItemRow[] | null }

  const total = (items ?? []).reduce(
    (sum, item) => sum + item.quantity * item.products.price_cents,
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
        {items?.map((item) => (
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
      <div className="mt-6 rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
        <p className="text-lg font-semibold text-foreground">合計: ¥{total.toLocaleString()}</p>
        <form action="/cart/checkout" method="post" className="mt-4">
          <fieldset>
            <legend className="text-sm font-medium text-foreground">支払い方法</legend>
            <div className="mt-2 flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
              <label className="flex items-center gap-2">
                <input type="radio" name="payment_method" value="card" defaultChecked />
                クレジットカード
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="payment_method" value="bank_transfer" />
                銀行振込
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="payment_method" value="cod" />
                代金引換
              </label>
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={!items?.length}
            className="mt-4 w-full rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            注文する
          </button>
        </form>
      </div>
    </main>
  )
}
