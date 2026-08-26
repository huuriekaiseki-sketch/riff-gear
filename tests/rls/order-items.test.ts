import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createDummyProduct, cleanupTestData } from '../helpers/test-fixtures'
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

    productId = await createDummyProduct({ name: 'order-items.test.ts専用ダミー商品' })

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
    await cleanupTestData({ userIds: [userA.id], productIds: [productId] })
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
