import { describe, it, expect } from 'vitest'
import {
  calculateSalesSummary,
  toDailySalesChartData,
  sortProductSalesByRevenue,
  type DailySalesRow,
  type ProductSalesSummaryRow,
} from '@/lib/sales-dashboard'

describe('calculateSalesSummary', () => {
  it('総売上・総注文数・平均注文額を計算する', () => {
    const rows: DailySalesRow[] = [
      { sales_date: '2026-08-24', total_cents: 10_000, order_count: 1 },
      { sales_date: '2026-08-25', total_cents: 50_000, order_count: 2 },
    ]
    const result = calculateSalesSummary(rows)
    expect(result).toEqual({
      totalCents: 60_000,
      orderCount: 3,
      averageOrderCents: 20_000,
    })
  })

  it('割り切れない場合は四捨五入する', () => {
    const rows: DailySalesRow[] = [{ sales_date: '2026-08-25', total_cents: 20_001, order_count: 2 }]
    const result = calculateSalesSummary(rows)
    expect(result.averageOrderCents).toBe(10_001) // (20001/2 = 10000.5 -> round -> 10001)
  })

  it('注文が0件なら平均は0(0除算しない)', () => {
    const result = calculateSalesSummary([])
    expect(result).toEqual({ totalCents: 0, orderCount: 0, averageOrderCents: 0 })
  })
})

describe('toDailySalesChartData', () => {
  const today = new Date('2026-08-25T12:00:00+09:00')

  it('直近days日分の連続した日付系列を返す', () => {
    const rows: DailySalesRow[] = [{ sales_date: '2026-08-25', total_cents: 1_000, order_count: 1 }]
    const result = toDailySalesChartData(rows, 3, today)
    expect(result.map((r) => r.date)).toEqual(['2026-08-23', '2026-08-24', '2026-08-25'])
  })

  it('売上が発生しなかった日は0円で埋める', () => {
    const rows: DailySalesRow[] = [{ sales_date: '2026-08-25', total_cents: 1_000, order_count: 1 }]
    const result = toDailySalesChartData(rows, 3, today)
    expect(result.find((r) => r.date === '2026-08-24')).toEqual({
      date: '2026-08-24',
      totalCents: 0,
      orderCount: 0,
    })
  })

  it('該当日の売上・注文数をそのまま反映する', () => {
    const rows: DailySalesRow[] = [{ sales_date: '2026-08-25', total_cents: 12_000, order_count: 3 }]
    const result = toDailySalesChartData(rows, 1, today)
    expect(result).toEqual([{ date: '2026-08-25', totalCents: 12_000, orderCount: 3 }])
  })

  it('days/todayを省略した場合は直近30日をデフォルトで返す', () => {
    const result = toDailySalesChartData([])
    expect(result).toHaveLength(30)
  })
})

describe('sortProductSalesByRevenue', () => {
  it('売上金額降順に並べ替える', () => {
    const rows: ProductSalesSummaryRow[] = [
      { product_id: 'a', product_name: 'アコギA', sales_count: 1, total_cents: 30_000 },
      { product_id: 'b', product_name: 'エレキB', sales_count: 2, total_cents: 90_000 },
      { product_id: 'c', product_name: 'キーボードC', sales_count: 3, total_cents: 60_000 },
    ]
    const result = sortProductSalesByRevenue(rows)
    expect(result.map((r) => r.product_id)).toEqual(['b', 'c', 'a'])
  })

  it('同額は商品名の昇順で安定させる', () => {
    const rows: ProductSalesSummaryRow[] = [
      { product_id: 'x2', product_name: 'ぶび', sales_count: 1, total_cents: 10_000 },
      { product_id: 'x1', product_name: 'あいう', sales_count: 1, total_cents: 10_000 },
    ]
    const result = sortProductSalesByRevenue(rows)
    expect(result.map((r) => r.product_id)).toEqual(['x1', 'x2'])
  })
})
