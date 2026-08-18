'use client'

import { useOptimistic, useTransition } from 'react'
import { toggleFavorite } from './actions'

// お気に入りのハートボタン。押した瞬間に見た目を切り替え(useOptimistic)、
// サーバーアクション完了後にrevalidatePathで実際の状態に補正される。
export default function FavoriteButton({
  productId,
  initialIsFavorited,
}: {
  productId: string
  initialIsFavorited: boolean
}) {
  const [isFavorited, setOptimisticFavorited] = useOptimistic(initialIsFavorited)
  const [, startTransition] = useTransition()

  return (
    <form
      action={(formData) => {
        startTransition(() => {
          setOptimisticFavorited(!isFavorited)
          toggleFavorite(formData)
        })
      }}
    >
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        aria-label={isFavorited ? 'お気に入りから削除' : 'お気に入りに追加'}
        aria-pressed={isFavorited}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-lg shadow-sm backdrop-blur transition-transform hover:scale-110 dark:bg-black/50"
      >
        {isFavorited ? '❤️' : '🤍'}
      </button>
    </form>
  )
}
