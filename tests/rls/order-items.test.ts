import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

describe('order_items RLS', () => {
  let userA: TestUser
  let userB: TestUser
  let admin: TestUser
  let orderAId: string
  let productId: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')
    admin = await createTestUser('admin')

    // シードデータの共有商品を使うと、並列実行される他のテストファイルと
    // 在庫を奪い合って「在庫不足」で失敗することがある(実際に発生した既知の不具合)。
    // このテスト専用のダミー商品を作ることで、他のテストファイルと在庫を共有しない。
    const adminClient = createAdminClient()
    const { data: product } = await adminClient
      .from('products')
      .insert({ name: 'order-items.test.ts専用ダミー商品', category: 'accessory', price_cents: 1000, stock: 5 })
      .select('id')
      .single()
    productId = product!.id

    const { data: cart } = await userA.client
      .from('carts')
      .insert({ user_id: userA.id })
      .select('id')
      .single()
    await userA.client
      .from('cart_items')
      .insert({ cart_id: cart!.id, product_id: productId, quantity: 1 })

    const { data: orderId, error } = await userA.client.rpc('place_order', { p_payment_method: 'card' })
    expect(error).toBeNull()
    orderAId = orderId as string
  })

  afterAll(async () => {
    const adminClient = createAdminClient()

    // orders.user_idにon delete cascadeが無いため、注文行を残したままuserAを削除すると
    // FK違反でdeleteUserが失敗し（かつdeleteTestUserはエラーを握りつぶすため）気づかぬまま
    // auth.usersとordersにゴミが蓄積し続ける。先に注文を明示的に削除する
    // （order_itemsはorders.idへのon delete cascadeがあるため連鎖的に消える）
    if (orderAId) {
      await adminClient.from('orders').delete().eq('id', orderAId)
    }

    // このテスト専用ダミー商品を削除する。cart_itemsがまだ参照している可能性がある
    // (place_orderに失敗した側のカートには商品が残ったままになるため)ので、
    // productsを消す前にcart_itemsの参照を先に消しておく
    if (productId) {
      await adminClient.from('cart_items').delete().eq('product_id', productId)
      await adminClient.from('products').delete().eq('id', productId)
    }

    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
    await deleteTestUser(admin.id)
  })

  it('customer: 自分のorderに紐づくitemをSELECTできる', async () => {
    const { data, error } = await userA.client
      .from('order_items')
      .select('id')
      .eq('order_id', orderAId)
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('customer: order_itemsへの直接INSERTは拒否される', async () => {
    const { data: product } = await createAdminClient().from('products').select('id').limit(1).single()
    const { error } = await userA.client
      .from('order_items')
      .insert({ order_id: orderAId, product_id: product!.id, quantity: 1, price_cents_at_order: 100 })
    expect(error).not.toBeNull()
  })

  it('customer: userBはuserAのorder_itemsをSELECTできない', async () => {
    const { data, error } = await userB.client
      .from('order_items')
      .select('id')
      .eq('order_id', orderAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(0)
  })

  it('admin: 他人のorder_itemsをSELECTできる', async () => {
    const { data, error } = await admin.client
      .from('order_items')
      .select('id')
      .eq('order_id', orderAId)
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })
})
