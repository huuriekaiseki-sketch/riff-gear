import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

describe('orders RLS', () => {
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
      .insert({ name: 'orders.test.ts専用ダミー商品', category: 'accessory', price_cents: 1000, stock: 5 })
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

  it('customer: place_order RPC経由なら注文が作れる（beforeAllで確認済み）', () => {
    expect(orderAId).toBeTruthy()
  })

  it('customer: ordersへの直接INSERTは拒否される', async () => {
    // ordersにはINSERTポリシーが存在しないため、値の衝突有無に関わらずRLSのみで拒否される
    const { error } = await userA.client
      .from('orders')
      .insert({ user_id: userA.id, status: 'received', total_cents: 100 })
    expect(error).not.toBeNull()
  })

  it('customer: 自分のorderをSELECTできる', async () => {
    const { data, error } = await userA.client.from('orders').select('id').eq('id', orderAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it('customer: userBはuserAのorderをSELECTできない', async () => {
    const { data, error } = await userB.client.from('orders').select('id').eq('id', orderAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(0)
  })

  it('customer: userBはuserAのorderのstatusをUPDATEできない', async () => {
    await userB.client.from('orders').update({ status: 'cancelled' }).eq('id', orderAId)
    const { data } = await createAdminClient()
      .from('orders')
      .select('status')
      .eq('id', orderAId)
      .single()
    expect(data?.status).toBe('received')
  })

  it('admin: 他人のorderをSELECT・status UPDATEできる', async () => {
    const { error: selectError } = await admin.client.from('orders').select('id').eq('id', orderAId)
    expect(selectError).toBeNull()

    const { error: updateError } = await admin.client
      .from('orders')
      .update({ status: 'preparing' })
      .eq('id', orderAId)
    expect(updateError).toBeNull()
  })
})
