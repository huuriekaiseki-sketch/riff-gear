import { describe, expect, it } from 'vitest'
import { countVotesByReviewId, parseRating, sortReviewsByHelpfulness, summarizeRatings } from '@/lib/reviews'

describe('parseRating', () => {
  it('1〜5の整数はそのまま返す', () => {
    expect(parseRating('1')).toBe(1)
    expect(parseRating('5')).toBe(5)
    expect(parseRating('3')).toBe(3)
  })

  it('範囲外の数値はnullを返す', () => {
    expect(parseRating('0')).toBeNull()
    expect(parseRating('6')).toBeNull()
    expect(parseRating('-1')).toBeNull()
  })

  it('小数はnullを返す', () => {
    expect(parseRating('3.5')).toBeNull()
  })

  it('数値でない値やnullはnullを返す', () => {
    expect(parseRating('abc')).toBeNull()
    expect(parseRating(null)).toBeNull()
    expect(parseRating('')).toBeNull()
  })
})

describe('summarizeRatings', () => {
  it('0件のとき平均0・件数0を返す', () => {
    expect(summarizeRatings([])).toEqual({ average: 0, count: 0 })
  })

  it('平均を小数第2位までに丸める', () => {
    expect(summarizeRatings([5, 4, 4])).toEqual({ average: 4.33, count: 3 })
  })

  it('割り切れる場合はそのまま', () => {
    expect(summarizeRatings([4, 5])).toEqual({ average: 4.5, count: 2 })
  })

  it('1件のときはその値そのもの', () => {
    expect(summarizeRatings([3])).toEqual({ average: 3, count: 1 })
  })
})

describe('countVotesByReviewId', () => {
  it('空配列のときは空のMapを返す', () => {
    expect(countVotesByReviewId([]).size).toBe(0)
  })

  it('レビューIDごとに投票数を集計する', () => {
    const votes = [{ review_id: 'r1' }, { review_id: 'r2' }, { review_id: 'r1' }, { review_id: 'r1' }]
    const result = countVotesByReviewId(votes)
    expect(result.get('r1')).toBe(3)
    expect(result.get('r2')).toBe(1)
  })

  it('投票がないレビューIDはMapに含まれない(0票扱い)', () => {
    const result = countVotesByReviewId([{ review_id: 'r1' }])
    expect(result.get('r2')).toBeUndefined()
  })
})

describe('sortReviewsByHelpfulness', () => {
  it('投票数の降順に並び替える', () => {
    const reviews = [
      { id: 'r1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'r2', created_at: '2026-01-01T00:00:00Z' },
      { id: 'r3', created_at: '2026-01-01T00:00:00Z' },
    ]
    const counts = new Map([
      ['r1', 1],
      ['r2', 5],
      ['r3', 3],
    ])
    expect(sortReviewsByHelpfulness(reviews, counts).map((r) => r.id)).toEqual(['r2', 'r3', 'r1'])
  })

  it('投票数が同数のときはcreated_at降順(新しい順)にする', () => {
    const reviews = [
      { id: 'r1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'r2', created_at: '2026-01-03T00:00:00Z' },
      { id: 'r3', created_at: '2026-01-02T00:00:00Z' },
    ]
    const counts = new Map<string, number>()
    expect(sortReviewsByHelpfulness(reviews, counts).map((r) => r.id)).toEqual(['r2', 'r3', 'r1'])
  })

  it('0票のレビュー(Mapに存在しない)はundefinedではなく0票として扱われる', () => {
    const reviews = [
      { id: 'r1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'r2', created_at: '2026-01-02T00:00:00Z' },
    ]
    const counts = new Map([['r1', 2]])
    expect(sortReviewsByHelpfulness(reviews, counts).map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('空配列を渡すと空配列を返す', () => {
    expect(sortReviewsByHelpfulness([], new Map())).toEqual([])
  })

  it('元の配列を変更しない(非破壊)', () => {
    const reviews = [
      { id: 'r1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'r2', created_at: '2026-01-02T00:00:00Z' },
    ]
    const original = [...reviews]
    sortReviewsByHelpfulness(reviews, new Map([['r2', 1]]))
    expect(reviews).toEqual(original)
  })
})
