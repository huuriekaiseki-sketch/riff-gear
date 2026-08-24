// レビュー機能まわりの純粋関数。DB非依存にしてユニットテストしやすくする。

export const MIN_RATING = 1
export const MAX_RATING = 5

// フォーム入力の評価値を検証する。1〜5の整数以外はnullを返す。
export function parseRating(value: FormDataEntryValue | null): number | null {
  const num = Number(value)
  if (!Number.isInteger(num) || num < MIN_RATING || num > MAX_RATING) return null
  return num
}

// レビュー一覧から平均評価と件数を計算する。0件のときは平均0。
export function summarizeRatings(ratings: number[]): { average: number; count: number } {
  const count = ratings.length
  if (count === 0) return { average: 0, count: 0 }
  const sum = ratings.reduce((acc, r) => acc + r, 0)
  // 小数第2位までに丸める(例: 4.666... → 4.67)
  return { average: Math.round((sum / count) * 100) / 100, count }
}

// review_helpful_votesの行配列からレビューIDごとの投票数を集計する。
// 0票のレビューはMapに現れないため、参照側はMap.get(id) ?? 0で扱う想定。
export function countVotesByReviewId(votes: { review_id: string }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const vote of votes) {
    map.set(vote.review_id, (map.get(vote.review_id) ?? 0) + 1)
  }
  return map
}

// レビュー一覧を「参考になった数の降順、同数はcreated_at降順(新しい順)」で並び替える。
// 引数の配列は変更せず、コピーしてからソートする(非破壊)。
export function sortReviewsByHelpfulness<T extends { id: string; created_at: string }>(
  reviews: T[],
  countByReviewId: Map<string, number>,
): T[] {
  return [...reviews].sort((a, b) => {
    const votesDiff = (countByReviewId.get(b.id) ?? 0) - (countByReviewId.get(a.id) ?? 0)
    if (votesDiff !== 0) return votesDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}
