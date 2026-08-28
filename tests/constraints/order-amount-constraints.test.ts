import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createDummyProduct, cleanupTestData } from '../helpers/test-fixtures'

// order_items.price_cents_at_order/orders.total_centsには非負制約が無く、
// order_itemsには同一注文内での商品重複を防ぐ制約も無かった。place_order()経由では
// 実害は出ていないが、管理画面やバッチ等アプリを経由しない書き込み経路ができた場合に
// 不正な金額・重複明細をDB制約自体が拒否することを検証する。
describe('注文金額・明細のDB制約', () => {
  let user: TestUser
  let productId: string
  let orderId: string

  beforeAll(async () => {
    user = await createTestUser('customer')
    productId = await createDummyProduct({ name: '金額制約テスト用ダミー商品' })

    const { data: cart } = await user.client
      .from('carts')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    await user.client.from('cart_items').insert({ cart_id: cart!.id, product_id: productId, quantity: 1 })

    const { data: placedOrderId, error: orderError } = await user.client.rpc('place_order', {
      p_payment_method: 'card',
    })
    expect(orderError).toBeNull()
    orderId = placedOrderId as string
  })

  afterAll(async () => {
    await cleanupTestData({ userIds: [user.id], productIds: [productId] })
    await deleteTestUser(user.id)
  })

  it('price_cents_at_order<0のorder_itemはDB制約で拒否される', async () => {
    const { error } = await createAdminClient()
      .from('order_items')
      .insert({ order_id: orderId, product_id: productId, quantity: 1, price_cents_at_order: -1 })
    expect(error).not.toBeNull()
  })

  it('total_cents<0のordersはDB制約で拒否される', async () => {
    const { error } = await createAdminClient().from('orders').update({ total_cents: -1 }).eq('id', orderId)
    expect(error).not.toBeNull()
  })

  it('同一注文・同一商品のorder_itemsはDB制約で拒否される(重複明細防止)', async () => {
    const { error } = await createAdminClient()
      .from('order_items')
      .insert({ order_id: orderId, product_id: productId, quantity: 1, price_cents_at_order: 1000 })
    expect(error).not.toBeNull()
  })

  it('拒否された後も既存のorder_items・ordersは変化しない', async () => {
    const { data: items } = await createAdminClient()
      .from('order_items')
      .select('id, price_cents_at_order')
      .eq('order_id', orderId)
    expect(items?.length).toBe(1)
    expect(items?.[0].price_cents_at_order).toBeGreaterThanOrEqual(0)

    const { data: order } = await createAdminClient()
      .from('orders')
      .select('total_cents')
      .eq('id', orderId)
      .single()
    expect(order?.total_cents).toBeGreaterThanOrEqual(0)
  })
})
