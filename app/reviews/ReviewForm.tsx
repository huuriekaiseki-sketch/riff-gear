'use client'

import { useState } from 'react'
import { submitReview } from './actions'

// レビュー投稿フォーム。星をクリックして評価を選び、コメントを添えて送信する。
// 既に自分のレビューがある場合は、その内容を初期値にして「上書き投稿」として振る舞う。
export default function ReviewForm({
  productId,
  initialRating,
  initialComment,
}: {
  productId: string
  initialRating?: number
  initialComment?: string
}) {
  const [rating, setRating] = useState(initialRating ?? 0)
  const [hoverRating, setHoverRating] = useState(0)

  return (
    <form action={submitReview} className="mt-4 rounded-2xl border border-gray-200 bg-surface p-4 dark:border-gray-800">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rating" value={rating} />
      <p className="text-sm font-medium text-foreground">
        {initialRating ? 'レビューを編集' : 'レビューを投稿'}
      </p>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label="評価">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star}点`}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            className="text-2xl leading-none"
          >
            {(hoverRating || rating) >= star ? '★' : '☆'}
          </button>
        ))}
      </div>
      <textarea
        name="comment"
        defaultValue={initialComment}
        placeholder="使ってみた感想を書いてください(任意)"
        rows={3}
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
      />
      <button
        type="submit"
        disabled={rating === 0}
        className="mt-3 rounded-full bg-gradient-to-r from-primary to-secondary px-5 py-2 text-sm font-medium text-white shadow-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {initialRating ? '更新する' : '投稿する'}
      </button>
    </form>
  )
}
