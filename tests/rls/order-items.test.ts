import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

describe('order_items RLS', () => {
  let userA: TestUser
  let userB: TestUser
  let admin: TestUser
  let orderAId: string
  let productId: string
  let productOriginalStock: number

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')
    admin = await createTestUser('admin')

    // place_orderは在庫を実際に減らすため、stock > 0の商品のみを対象にする
    // （afterAllで元の在庫数に戻すため、減算前の値も保持しておく）
    const adminClient = createAdminClient()
    const { data: product } = await adminClient
      .from('products')
      .select('id, stock')
      .gt('stock', 0)
      .limit(1)
      .single()
    productId = product!.id
    productOriginalStock = product!.stock

    const { data: cart } = await userA.client
      .from('carts')
      .insert({ user_id: userA.id })
      .select('id')
      .single()
    await userA.client
      .from('cart_items')
      .insert({ cart_id: cart!.id, product_id: productId, quantity: 1 })

    const { data: orderId, error } = await userA.client.rpc('place_order')
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

    // place_orderが実際に減らした在庫を元の値に戻す
    if (productId && typeof productOriginalStock === 'number') {
      await adminClient.from('products').update({ stock: productOriginalStock }).eq('id', productId)
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
