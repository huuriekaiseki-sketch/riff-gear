import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { removeFromCart, updateCartItemQuantity } from './actions'
import CheckoutForm from './CheckoutForm'

type CartItemRow = {
  id: string
  quantity: number
  products: { name: string; price_cents: number; stock: number }
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

  const { data: items } = cart
    ? ((await supabase
        .from('cart_items')
        .select('id, quantity, products(name, price_cents, stock)')
        .eq('cart_id', cart.id)) as { data: CartItemRow[] | null })
    : { data: null }

  if (!items?.length) {
    return (
      <main className="mx-auto max-w-2xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">カート</h1>
        <div className="mt-10 rounded-2xl border border-gray-200 bg-surface px-6 py-16 shadow-sm dark:border-gray-800">
          <p className="text-gray-500 dark:text-gray-400">カートに商品がありません。</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            商品を見る
          </Link>
        </div>
      </main>
    )
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.products.price_cents, 0)
  const hasOverStockItem = items.some((item) => item.quantity > item.products.stock)

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">カート</h1>
      {errorMessage && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <ul className="mt-6 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-surface shadow-sm dark:divide-gray-800 dark:border-gray-800">
        {items.map((item) => {
          const isOverStock = item.quantity > item.products.stock
          return (
            <li key={item.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <p className="font-medium text-foreground">{item.products.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  ¥{(item.products.price_cents * item.quantity).toLocaleString()}
                </p>
                {isOverStock && (
                  <p className="mt-1 text-sm text-danger">
                    在庫が{item.products.stock}個に減っています。数量を調整してください
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-full border border-gray-300 dark:border-gray-700">
                  <form action={updateCartItemQuantity}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="delta" value="-1" />
                    <button
                      type="submit"
                      aria-label="数量を減らす"
                      className="h-8 w-8 text-gray-600 transition-colors hover:text-primary dark:text-gray-300"
                    >
                      −
                    </button>
                  </form>
                  <span className="w-6 text-center text-sm font-medium text-foreground">
                    {item.quantity}
                  </span>
                  <form action={updateCartItemQuantity}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="delta" value="1" />
                    <button
                      type="submit"
                      aria-label="数量を増やす"
                      disabled={item.quantity >= item.products.stock}
                      className="h-8 w-8 text-gray-600 transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-300"
                    >
                      ＋
                    </button>
                  </form>
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
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-6 rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
        <p className="text-lg font-semibold text-foreground">合計: ¥{total.toLocaleString()}</p>
        {hasOverStockItem && (
          <p role="alert" className="mt-2 text-sm text-danger">
            在庫を超えている商品があります。数量を調整してから注文してください
          </p>
        )}
        <CheckoutForm disabled={hasOverStockItem} />
      </div>
    </main>
  )
}
