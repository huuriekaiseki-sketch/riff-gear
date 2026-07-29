import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

describe('cart_items RLS', () => {
  let userA: TestUser
  let userB: TestUser
  let admin: TestUser
  let cartAId: string
  let productId: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')
    admin = await createTestUser('admin')

    const adminClient = createAdminClient()
    const { data: product } = await adminClient.from('products').select('id').limit(1).single()
    productId = product!.id

    const { data: cart } = await userA.client
      .from('carts')
      .insert({ user_id: userA.id })
      .select('id')
      .single()
    cartAId = cart!.id
  })

  afterAll(async () => {
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
    await deleteTestUser(admin.id)
  })

  it('customer: 自分のcartへのINSERTができる', async () => {
    const { error } = await userA.client
      .from('cart_items')
      .insert({ cart_id: cartAId, product_id: productId, quantity: 1 })
    expect(error).toBeNull()
  })

  it('customer: userBはuserAのcart_itemsをSELECTできない', async () => {
    const { data, error } = await userB.client
      .from('cart_items')
      .select('id')
      .eq('cart_id', cartAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(0)
  })

  it('customer: userBはuserAのcartへINSERTできない', async () => {
    const { error } = await userB.client
      .from('cart_items')
      .insert({ cart_id: cartAId, product_id: productId, quantity: 1 })
    expect(error).not.toBeNull()
  })

  it('admin: 他人のcart_itemsをSELECT可', async () => {
    const { data, error } = await admin.client
      .from('cart_items')
      .select('id')
      .eq('cart_id', cartAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })
})
