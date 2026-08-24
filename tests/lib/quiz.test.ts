import { describe, it, expect } from 'vitest'
import { parseQuizParams, scoreQuizProducts, type QuizProduct } from '@/lib/quiz'

describe('parseQuizParams', () => {
  it('3問すべてが有効な値なら回答オブジェクトを返す', () => {
    expect(
      parseQuizParams({ category: 'guitar', budget: 'under_100000', focus: 'popular' }),
    ).toEqual({ category: 'guitar', budget: 'under_100000', focus: 'popular' })
  })

  it('未指定があればnullを返す', () => {
    expect(parseQuizParams({ category: 'guitar', budget: 'under_100000' })).toBeNull()
  })

  it('不正な値が混ざっていればnullを返す', () => {
    expect(
      parseQuizParams({ category: 'guitar', budget: 'invalid', focus: 'popular' }),
    ).toBeNull()
  })
})

function makeProduct(overrides: Partial<QuizProduct> & { id: string; name: string }): QuizProduct {
  return {
    category: 'guitar',
    price_cents: 50_000,
    stock: 5,
    specs: {},
    ...overrides,
  }
}

describe('scoreQuizProducts', () => {
  const products: QuizProduct[] = [
    makeProduct({ id: 'a', name: 'アコギA', category: 'guitar', price_cents: 30_000, specs: { weight_kg: 2 } }),
    makeProduct({ id: 'b', name: 'エレキB', category: 'guitar', price_cents: 180_000, specs: { pickup: 'humbucker', material: 'alder', weight_kg: 4 } }),
    makeProduct({ id: 'c', name: 'キーボードC', category: 'keyboard', price_cents: 90_000, specs: { keys: 61 } }),
  ]

  it('categoryがanyでなければ絞り込む', () => {
    const result = scoreQuizProducts(
      products,
      { category: 'guitar', budget: 'unlimited', focus: 'popular' },
      new Map(),
    )
    expect(result.every((p) => p.category === 'guitar')).toBe(true)
  })

  it('予算上限を超える商品を除外する', () => {
    const result = scoreQuizProducts(
      products,
      { category: 'any', budget: 'under_100000', focus: 'popular' },
      new Map(),
    )
    expect(result.map((p) => p.id)).not.toContain('b')
  })

  it('popularは販売数降順', () => {
    const salesCount = new Map([
      ['a', 1],
      ['b', 10],
      ['c', 5],
    ])
    const result = scoreQuizProducts(
      products,
      { category: 'any', budget: 'unlimited', focus: 'popular' },
      salesCount,
    )
    expect(result.map((p) => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('beginnerは安価かつ軽量な商品が上位に来る', () => {
    const result = scoreQuizProducts(
      products,
      { category: 'any', budget: 'unlimited', focus: 'beginner' },
      new Map(),
    )
    // 最安(3万円)かつ軽量(2kg)のaが最上位になるはず
    expect(result[0].id).toBe('a')
  })

  it('specは高価格かつspecs項目数の多い商品が上位に来る', () => {
    const result = scoreQuizProducts(
      products,
      { category: 'any', budget: 'unlimited', focus: 'spec' },
      new Map(),
    )
    // 最高価格(18万円)かつspecs3項目のbが最上位になるはず
    expect(result[0].id).toBe('b')
  })

  it('同点は名前順で安定させる', () => {
    const tied: QuizProduct[] = [
      makeProduct({ id: 'x2', name: 'ぶび', price_cents: 10_000 }),
      makeProduct({ id: 'x1', name: 'あいう', price_cents: 10_000 }),
    ]
    const result = scoreQuizProducts(
      tied,
      { category: 'any', budget: 'unlimited', focus: 'popular' },
      new Map(),
    )
    expect(result.map((p) => p.id)).toEqual(['x1', 'x2'])
  })

  it('上位3件までに絞る', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      makeProduct({ id: `p${i}`, name: `商品${i}`, price_cents: 10_000 * (i + 1) }),
    )
    const result = scoreQuizProducts(
      many,
      { category: 'any', budget: 'unlimited', focus: 'popular' },
      new Map(),
    )
    expect(result).toHaveLength(3)
  })

  it('該当商品が0件なら空配列を返す', () => {
    const result = scoreQuizProducts(
      products,
      { category: 'accessory', budget: 'unlimited', focus: 'popular' },
      new Map(),
    )
    expect(result).toEqual([])
  })
})
