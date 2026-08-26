import { createAdminClient } from '@/lib/supabase/admin'

export type DummyProductOverrides = Partial<{
  name: string
  category: string
  price_cents: number
  stock: number
}>

// テスト専用のダミー商品を作成する。シードデータの共有商品を使うと、並列実行される
// 他のテストファイルと在庫を奪い合って「在庫不足」で失敗することがある(実際に発生した
// 既知の不具合)。各テストファイルはこのヘルパーで独立した商品を作ることで在庫を共有しない。
export async function createDummyProduct(overrides: DummyProductOverrides = {}): Promise<string> {
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('products')
    .insert({
      name: overrides.name ?? `テスト用ダミー商品-${crypto.randomUUID().slice(0, 8)}`,
      category: overrides.category ?? 'accessory',
      price_cents: overrides.price_cents ?? 1000,
      stock: overrides.stock ?? 5,
    })
    .select('id')
    .single()
  if (error || !data) {
    throw new Error(`ダミー商品の作成に失敗: ${error?.message}`)
  }
  return data.id
}

// テストで作った注文・カート明細・商品を、FK制約を守る順序でまとめて削除する。
// - orders削除 → order_itemsはON DELETE CASCADEで連鎖削除される(0004)
// - cart_itemsはproductsへのON DELETE CASCADEが無いため明示的に削除する(0001)
// - products削除 → reviews(0013)はON DELETE CASCADEで連鎖削除され、
//   reviewsが消えればreview_helpful_votes(0024)も連鎖削除される
// orders.user_idにはON DELETE CASCADEが無いため、呼び出し側は必ずdeleteTestUser()より
// 先にこの関数を呼ぶこと(先にユーザーを消すとFK違反でorders削除が不可能になる)。
export async function cleanupTestData(params: { userIds?: string[]; productIds?: string[] }): Promise<void> {
  const adminClient = createAdminClient()
  const userIds = params.userIds ?? []
  const productIds = params.productIds ?? []

  if (userIds.length > 0) {
    const { data: orders } = await adminClient.from('orders').select('id').in('user_id', userIds)
    if (orders && orders.length > 0) {
      await adminClient
        .from('orders')
        .delete()
        .in(
          'id',
          orders.map((o) => o.id)
        )
    }
  }

  if (productIds.length > 0) {
    await adminClient.from('cart_items').delete().in('product_id', productIds)
    await adminClient.from('products').delete().in('id', productIds)
  }
}
