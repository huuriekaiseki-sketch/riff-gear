// 商品詳細ページの「一緒に購入されている商品」レコメンド(Issue #78)。
// - 共起の集計自体はDB集計RPC `get_co_purchased_products(target_product_id)` に任せ、
//   このファイルではRPC結果から上位N件のIDを選ぶ純関数だけを持つ。
//   0021のlib/product-sort.tsと同じ理由: 集計はproductsテーブルのカラムではなく
//   別集計(order_items×orders)であり、フェッチ後にJS側で並べ替える方針にしている。

// get_co_purchased_products() RPCの戻り値1行分の型。
export interface CoPurchasedProduct {
  product_id: string
  co_purchase_count: number
}

// 共起回数(co_purchase_count)の降順で上位limit件のproduct_idを返す純関数。
// 同数の場合はproduct_id文字列の昇順で安定させる(RPC側のorder順序に依存しないため)。
export function pickTopCoPurchasedIds(
  rows: CoPurchasedProduct[] | null | undefined,
  limit: number,
): string[] {
  const sorted = [...(rows ?? [])].sort((a, b) => {
    const diff = b.co_purchase_count - a.co_purchase_count
    if (diff !== 0) return diff
    return a.product_id.localeCompare(b.product_id)
  })
  return sorted.slice(0, limit).map((row) => row.product_id)
}
