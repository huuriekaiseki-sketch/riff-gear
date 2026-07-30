import { createServerSupabaseClient } from '@/lib/supabase/server'
import { addToCart } from './cart/actions'

// 商品一覧ページ。カテゴリ→名前順で全商品を取得し、在庫切れ(stock=0)、
// または既に自分のカートに在庫上限まで入れている場合は
// カート追加ボタンの代わりに「売り切れ」表示に差し替える。
export default async function ProductListPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: errorMessage } = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, category, price_cents, stock')
    .order('category')
    .order('name')

  if (error) {
    return <p role="alert">商品の取得に失敗しました: {error.message}</p>
  }

  // ログイン中なら、自分のカートに既に入っている数量を商品ごとに取得し、
  // 「在庫 − カート内数量」を実質の残数として扱う。
  const { data: userData } = await supabase.auth.getUser()
  const cartQuantityByProductId = new Map<string, number>()
  if (userData.user) {
    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (cart) {
      const { data: cartItems } = await supabase
        .from('cart_items')
        .select('product_id, quantity')
        .eq('cart_id', cart.id)
      for (const item of cartItems ?? []) {
        cartQuantityByProductId.set(item.product_id, item.quantity)
      }
    }
  }

  const CATEGORY_LABEL: Record<string, string> = {
    guitar: 'ギター',
    keyboard: 'キーボード',
    accessory: 'アクセサリー',
  }

  return (
    <main>
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Riff Gear</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          ギター・キーボードなど、バンド機材のセレクトショップ
        </p>
      </div>
      {errorMessage && (
        <p role="alert" className="mb-6 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products?.map((p) => {
          const remaining = p.stock - (cartQuantityByProductId.get(p.id) ?? 0)
          return (
            <li
              key={p.id}
              className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800"
            >
              <div>
                <span className="inline-block rounded-full bg-secondary/10 px-3 py-1 text-xs font-medium text-secondary">
                  {CATEGORY_LABEL[p.category] ?? p.category}
                </span>
                <h2 className="mt-3 text-lg font-medium text-foreground">{p.name}</h2>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  ¥{p.price_cents.toLocaleString()}
                </p>
                {remaining > 0 && (
                  <p
                    className={`mt-1 text-sm ${
                      remaining <= 3 ? 'font-medium text-warning' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    残り{remaining}個
                  </p>
                )}
              </div>
              {remaining <= 0 ? (
                <span className="mt-4 inline-flex w-fit items-center rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  売り切れ
                </span>
              ) : (
                <form action={addToCart} className="mt-4">
                  <input type="hidden" name="productId" value={p.id} />
                  <button
                    type="submit"
                    className="w-full rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    カートに追加
                  </button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
