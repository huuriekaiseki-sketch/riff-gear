import { describe, expect, it } from 'vitest'
import { parseRating, summarizeRatings } from '@/lib/reviews'

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
