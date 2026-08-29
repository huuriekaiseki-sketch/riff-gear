import { describe, it, expect, vi, afterEach } from 'vitest'
import { isOverdueUnshipped } from '@/lib/orderAlerts'

describe('isOverdueUnshipped', () => {
  const NOW = new Date('2026-08-29T00:00:00Z')

  afterEach(() => {
    vi.useRealTimers()
  })

  it('未発送ステータスかつ3日超過なら true を返す', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const createdAt = new Date('2026-08-25T00:00:00Z').toISOString()
    expect(isOverdueUnshipped('received', createdAt)).toBe(true)
    expect(isOverdueUnshipped('preparing', createdAt)).toBe(true)
  })

  it('未発送ステータスでも3日以内なら false を返す', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const createdAt = new Date('2026-08-27T00:00:00Z').toISOString()
    expect(isOverdueUnshipped('received', createdAt)).toBe(false)
  })

  it('発送済み・キャンセル済みは経過日数に関わらず false を返す', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const createdAt = new Date('2026-08-01T00:00:00Z').toISOString()
    expect(isOverdueUnshipped('shipped', createdAt)).toBe(false)
    expect(isOverdueUnshipped('cancelled', createdAt)).toBe(false)
  })

  it('3日の境界値ちょうどでは false を返す', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const createdAt = new Date('2026-08-26T00:00:00Z').toISOString()
    expect(isOverdueUnshipped('received', createdAt)).toBe(false)
  })
})
