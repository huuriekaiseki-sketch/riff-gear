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
