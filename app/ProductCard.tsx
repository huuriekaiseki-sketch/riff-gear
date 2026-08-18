'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useOptimistic, useState } from 'react'
import { addToCart } from './cart/actions'
import FavoriteButton from './favorites/FavoriteButton'
import { CATEGORY_STYLE, DEFAULT_STYLE } from '@/lib/categories'

type Product = {
  id: string
  name: string
  category: string
  categoryLabel: string
  price_cents: number
}

type Status = 'idle' | 'pending' | 'done'

// 商品カード。「カートに追加」を押した瞬間に残数をその場で1つ減らす
// (useOptimistic)。サーバーの応答(revalidatePathによる再取得)が返ると、
// 実際のDB上の値に自動的に補正される。上限に達している場合は
// addToCart側のサーバーチェックで拒否され、そのときは実際の値に戻る。
//
// ボタン自体はサーバーアクション完了中はスピナー付き「追加中...」、
// 完了直後は「✓ 追加しました」に切り替わり、約1.2秒後に元の表示へ戻る。
export default function ProductCard({
  product,
  initialRemaining,
  isFavorited,
}: {
  product: Product
  initialRemaining: number
  isFavorited?: boolean
}) {
  const [remaining, decrementOptimistic] = useOptimistic(
    initialRemaining,
    (state: number, delta: number) => Math.max(state - delta, 0)
  )
  const [status, setStatus] = useState<Status>('idle')
  const style = CATEGORY_STYLE[product.category] ?? DEFAULT_STYLE

  async function handleAddToCart(formData: FormData) {
    decrementOptimistic(1)
    setStatus('pending')
    await addToCart(formData)
    setStatus('done')
    setTimeout(() => setStatus('idle'), 1200)
  }

  return (
    <li className="group flex flex-col justify-between rounded-2xl border border-gray-200/60 bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-4px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_16px_40px_-8px_rgba(0,0,0,0.16)] dark:border-gray-800/60">
      <div>
        <div className="relative mb-4 h-28 overflow-hidden rounded-xl shadow-inner">
          <Link href={`/products/${product.id}`} className="block h-full w-full">
            <Image
              src={style.photoUrl}
              alt={product.categoryLabel}
              fill
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className={`absolute inset-0 bg-gradient-to-t ${style.gradient} opacity-25`} />
          </Link>
          {isFavorited !== undefined && (
            <div className="absolute right-2 top-2">
              <FavoriteButton productId={product.id} initialIsFavorited={isFavorited} />
            </div>
          )}
        </div>
        <span
          className={`inline-block rounded-full bg-gradient-to-r px-3 py-1 text-xs font-semibold text-white shadow-sm ${style.gradient}`}
        >
          {product.categoryLabel}
        </span>
        <h2 className="mt-3 text-lg font-medium text-foreground">
          <Link href={`/products/${product.id}`} className="hover:underline">
            {product.name}
          </Link>
        </h2>
        <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
          ¥{product.price_cents.toLocaleString()}
        </p>
        {remaining > 0 &&
          (remaining <= 3 ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">
              残りわずか{remaining}点
            </span>
          ) : (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">残り{remaining}個</p>
          ))}
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
            disabled={status === 'pending'}
            className="w-full rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-150 hover:scale-105 hover:shadow-lg hover:shadow-primary/30 disabled:cursor-wait disabled:opacity-80 disabled:hover:scale-100"
          >
            {status === 'pending' ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                追加中...
              </span>
            ) : status === 'done' ? (
              <span className="flex items-center justify-center gap-1.5">✓ 追加しました</span>
            ) : (
              'カートに追加'
            )}
          </button>
        </form>
      )}
    </li>
  )
}
