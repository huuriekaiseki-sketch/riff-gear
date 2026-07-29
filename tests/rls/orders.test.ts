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

    // place_orderは在庫を実際に減らすため、stock > 0の商品のみを対象にする
    const adminClient = createAdminClient()
    const { data: product } = await adminClient
      .from('products')
      .select('id')
      .gt('stock', 0)
      .limit(1)
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

    const { data: orderId, error } = await userA.client.rpc('place_order')
    expect(error).toBeNull()
    orderAId = orderId as string
  })

  afterAll(async () => {
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
