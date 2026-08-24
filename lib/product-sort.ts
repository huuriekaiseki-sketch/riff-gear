// 商品一覧の並び替え(Issue #76)。
// - recommended/price_asc/price_desc/newest はDBの`order`句だけで完結する。
// - popular(人気順)はDB集計RPC `get_product_sales_counts()` の結果(Map)を使い、
//   フェッチ後にJS側で安定ソートする方針にしている。理由: 販売数はproductsテーブルの
//   カラムではなく別集計(order_items×orders)であり、1クエリのorder句には乗せられないため。

export type SortValue = 'recommended' | 'price_asc' | 'price_desc' | 'newest' | 'popular'

const SORT_VALUES: readonly SortValue[] = [
  'recommended',
  'price_asc',
  'price_desc',
  'newest',
  'popular',
] as const

export const SORT_OPTIONS: ReadonlyArray<{ value: SortValue; label: string }> = [
  { value: 'recommended', label: 'おすすめ順' },
  { value: 'price_asc', label: '価格の安い順' },
  { value: 'price_desc', label: '価格の高い順' },
  { value: 'newest', label: '新着順' },
  { value: 'popular', label: '人気順' },
]

export const DEFAULT_SORT: SortValue = 'recommended'

// URLのsearchParamsから来る生の値をSortValueへ変換する純関数。
// 不正な値・未指定は現行のデフォルト(カテゴリ→名前順)にフォールバックする。
export function parseSortParam(raw: string | undefined): SortValue {
  if (raw && (SORT_VALUES as readonly string[]).includes(raw)) {
    return raw as SortValue
  }
  return DEFAULT_SORT
}

// Supabaseのクエリビルダーに`.order(...)`を積んでいくためだけの最小限の型。
// PostgrestFilterBuilder全体を持ち込むと呼び出し側の型が複雑化するため、
// 「orderを呼べてチェーンできる」という最小の形に絞っている。
export interface Orderable<T> {
  order: (column: string, options?: { ascending?: boolean }) => T
}

// recommended/price_asc/price_desc/newest の4種類はDBのorder句だけで表現できる。
// popularはここでは何もしない(呼び出し側でフェッチ後にsortByPopularityを使う)。
export function applySort<T extends Orderable<T>>(query: T, sort: SortValue): T {
  switch (sort) {
    case 'price_asc':
      return query.order('price_cents', { ascending: true })
    case 'price_desc':
      return query.order('price_cents', { ascending: false })
    case 'newest':
      return query.order('created_at', { ascending: false })
    case 'popular':
      // 人気順はDB側のorderでは表現できないため、呼び出し側のデフォルト
      // (現行のcategory→name)のままにしておき、フェッチ後にJS側で並べ替える。
      return query.order('category').order('name')
    case 'recommended':
    default:
      return query.order('category').order('name')
  }
}

// get_product_sales_counts() RPCの戻り値1行分の型。
export interface ProductSalesCount {
  product_id: string
  sales_count: number
}

// RPCの結果配列を product_id -> sales_count のMapへ変換するヘルパー。
export function toSalesCountMap(rows: ProductSalesCount[] | null | undefined): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows ?? []) {
    map.set(row.product_id, row.sales_count)
  }
  return map
}

// 人気順(popular)のための安定ソート。販売数の降順、同数は名前の昇順。
// 集計にヒットしない商品(一度も売れていない商品)は0件として扱う。
export function sortByPopularity<T extends { id: string; name: string }>(
  products: T[],
  salesCountByProductId: Map<string, number>,
): T[] {
  return [...products].sort((a, b) => {
    const diff = (salesCountByProductId.get(b.id) ?? 0) - (salesCountByProductId.get(a.id) ?? 0)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name, 'ja')
  })
}
