'use client'

import { useOptimistic, useTransition } from 'react'
import { subscribeRestock, unsubscribeRestock } from '@/lib/restock'

// 売り切れ商品の「再入荷したら知らせる」トグルボタン。
// 押した瞬間に見た目を切り替え(useOptimistic)、サーバーアクション完了後に
// revalidatePathで実際の購読状態に補正される(FavoriteButtonと同じ設計)。
export default function RestockButton({
  productId,
  initialIsSubscribed,
}: {
  productId: string
  initialIsSubscribed: boolean
}) {
  const [isSubscribed, setOptimisticSubscribed] = useOptimistic(initialIsSubscribed)
  const [, startTransition] = useTransition()

  return (
    <form
      action={(formData) => {
        startTransition(() => {
          setOptimisticSubscribed(!isSubscribed)
          if (isSubscribed) {
            unsubscribeRestock(formData)
          } else {
            subscribeRestock(formData)
          }
        })
      }}
      className="mt-2"
    >
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        aria-pressed={isSubscribed}
        className={`w-full rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          isSubscribed
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-gray-300 text-gray-600 hover:border-primary/40 hover:text-primary dark:border-gray-700 dark:text-gray-300'
        }`}
      >
        {isSubscribed ? '登録済み（解除）' : '再入荷したら知らせる'}
      </button>
    </form>
  )
}
