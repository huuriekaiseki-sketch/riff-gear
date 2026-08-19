import { deleteReview } from './actions'

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
export default function ReviewList({
  productId,
  reviews,
  currentUserId,
}: {
  productId: string
  reviews: Review[]
  currentUserId?: string
}) {
  if (reviews.length === 0) {
    return <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">まだレビューがありません。</p>
  }

  return (
    <ul className="mt-4 space-y-3">
      {reviews.map((review) => (
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
          {currentUserId === review.user_id && (
            <form action={deleteReview} className="mt-2">
              <input type="hidden" name="reviewId" value={review.id} />
              <input type="hidden" name="productId" value={productId} />
              <button type="submit" className="text-xs text-gray-400 underline hover:text-danger">
                削除
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  )
}
