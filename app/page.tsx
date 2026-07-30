import { createServerSupabaseClient } from '@/lib/supabase/server'
import { addToCart } from './cart/actions'

// 商品一覧ページ。カテゴリ→名前順で全商品を取得し、在庫切れ(stock=0)は
// カート追加ボタンの代わりに「売り切れ」表示に差し替える。
export default async function ProductListPage() {
  const supabase = await createServerSupabaseClient()
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, category, price_cents, stock')
    .order('category')
    .order('name')

  if (error) {
    return <p role="alert">商品の取得に失敗しました: {error.message}</p>
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
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products?.map((p) => (
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
              {p.stock > 0 && (
                <p
                  className={`mt-1 text-sm ${
                    p.stock <= 3 ? 'font-medium text-warning' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  残り{p.stock}個
                </p>
              )}
            </div>
            {p.stock === 0 ? (
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
        ))}
      </ul>
    </main>
  )
}
