import { describe, expect, it } from 'vitest'
import { FREE_SHIPPING_THRESHOLD_CENTS, getShippingProgress } from '@/lib/shipping'

describe('getShippingProgress', () => {
  it('合計0円のとき残額は閾値そのもの・進捗0%', () => {
    const result = getShippingProgress(0)
    expect(result.isFree).toBe(false)
    expect(result.remainingCents).toBe(FREE_SHIPPING_THRESHOLD_CENTS)
    expect(result.percent).toBe(0)
  })

  it('閾値未満のとき残額と進捗率を返す', () => {
    const result = getShippingProgress(2500)
    expect(result.isFree).toBe(false)
    expect(result.remainingCents).toBe(7500)
    expect(result.percent).toBe(25)
  })

  it('閾値ちょうどで送料無料になる', () => {
    const result = getShippingProgress(FREE_SHIPPING_THRESHOLD_CENTS)
    expect(result.isFree).toBe(true)
    expect(result.remainingCents).toBe(0)
    expect(result.percent).toBe(100)
  })

  it('閾値を超えても進捗率は100%で頭打ち', () => {
    const result = getShippingProgress(498000)
    expect(result.isFree).toBe(true)
    expect(result.remainingCents).toBe(0)
    expect(result.percent).toBe(100)
  })

  it('負の合計(異常値)でも0円扱いで壊れない', () => {
    const result = getShippingProgress(-100)
    expect(result.isFree).toBe(false)
    expect(result.remainingCents).toBe(FREE_SHIPPING_THRESHOLD_CENTS)
    expect(result.percent).toBe(0)
  })

  it('進捗率は整数に切り捨てられる', () => {
    // 999 / 10000 = 9.99% → 9%
    expect(getShippingProgress(999).percent).toBe(9)
  })
})
