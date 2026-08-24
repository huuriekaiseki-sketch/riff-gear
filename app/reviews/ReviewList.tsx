import { deleteReview, toggleHelpfulVote } from './actions'

type Review = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  user_id: string
}

// レビュー一覧。投稿者名はprofilesのRLS(本人のみ閲覧可)により他人からは
// 取得できないため、個人が特定できない「購入者」表記にする。
// 自分のレビューには削除ボタンを表示する。
// 「参考になった」投票数(helpfulCountByReviewId)と自分の投票済みレビューID
// (votedReviewIds)は、並び替え済みのreviews配列とあわせて呼び出し元
// (商品詳細ページ)がDB取得後に用意して渡す。未ログイン(currentUserId未指定)
// では件数のみ表示し、投票ボタンは出さない。
export default function ReviewList({
  productId,
  reviews,
  currentUserId,
  helpfulCountByReviewId = {},
  votedReviewIds = [],
}: {
  productId: string
  reviews: Review[]
  currentUserId?: string
  helpfulCountByReviewId?: Record<string, number>
  votedReviewIds?: string[]
}) {
  if (reviews.length === 0) {
    return <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">まだレビューがありません。</p>
  }

  const votedSet = new Set(votedReviewIds)

  return (
    <ul className="mt-4 space-y-3">
      {reviews.map((review) => {
        const helpfulCount = helpfulCountByReviewId[review.id] ?? 0
        const votedByMe = votedSet.has(review.id)

        return (
          <li
            key={review.id}
            className="rounded-2xl border border-gray-200 bg-surface p-4 dark:border-gray-800"
          >
            <div className="flex items-center justify-between">
              <span className="text-warning" aria-label={`評価${review.rating}点`}>
                {'★'.repeat(review.rating)}
                {'☆'.repeat(5 - review.rating)}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(review.created_at).toLocaleDateString('ja-JP')}
              </span>
            </div>
            {review.comment && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{review.comment}</p>
            )}
            <div className="mt-2 flex items-center gap-3">
              {currentUserId ? (
                <form action={toggleHelpfulVote}>
                  <input type="hidden" name="reviewId" value={review.id} />
                  <input type="hidden" name="productId" value={productId} />
                  <button
                    type="submit"
                    aria-pressed={votedByMe}
                    className={
                      votedByMe
                        ? 'rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary'
                        : 'rounded-full px-2 py-1 text-xs text-gray-500 hover:text-primary dark:text-gray-400'
                    }
                  >
                    👍 参考になった ({helpfulCount})
                  </button>
                </form>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  👍 参考になった ({helpfulCount})
                </span>
              )}
              {currentUserId === review.user_id && (
                <form action={deleteReview}>
                  <input type="hidden" name="reviewId" value={review.id} />
                  <input type="hidden" name="productId" value={productId} />
                  <button type="submit" className="text-xs text-gray-400 underline hover:text-danger">
                    削除
                  </button>
                </form>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
