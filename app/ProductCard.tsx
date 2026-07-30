'use client'

import { useOptimistic } from 'react'
import { addToCart } from './cart/actions'

type Product = {
  id: string
  name: string
  categoryLabel: string
  price_cents: number
}

// 商品カード。「カートに追加」を押した瞬間に残数をその場で1つ減らす
// (useOptimistic)。サーバーの応答(revalidatePathによる再取得)が返ると、
// 実際のDB上の値に自動的に補正される。上限に達している場合は
// addToCart側のサーバーチェックで拒否され、そのときは実際の値に戻る。
export default function ProductCard({
  product,
  initialRemaining,
}: {
  product: Product
  initialRemaining: number
}) {
  const [remaining, decrementOptimistic] = useOptimistic(
    initialRemaining,
    (state: number, delta: number) => Math.max(state - delta, 0)
  )

  async function handleAddToCart(formData: FormData) {
    decrementOptimistic(1)
    await addToCart(formData)
  }

  return (
    <li className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800">
      <div>
        <span className="inline-block rounded-full bg-secondary/10 px-3 py-1 text-xs font-medium text-secondary">
          {product.categoryLabel}
        </span>
        <h2 className="mt-3 text-lg font-medium text-foreground">{product.name}</h2>
        <p className="mt-1 text-xl font-semibold text-foreground">
          ¥{product.price_cents.toLocaleString()}
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
        <form action={handleAddToCart} className="mt-4">
          <input type="hidden" name="productId" value={product.id} />
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
}
