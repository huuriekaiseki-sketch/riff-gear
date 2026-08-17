import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

describe('cart_items RLS', () => {
  let userA: TestUser
  let userB: TestUser
  let admin: TestUser
  let cartAId: string
  let productId: string
  let productId2: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')
    admin = await createTestUser('admin')

    // ユニーク制約(cart_id, product_id)に依存せずRLSのみで拒否を検証するため、
    // 2件のproductを取得してテストケースごとに異なるproduct_idを使う
    const adminClient = createAdminClient()
    const { data: products } = await adminClient.from('products').select('id').limit(2)
    productId = products![0].id
    productId2 = products![1].id

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
    // productId2(テストケース1と異なる商品)を使い、unique(cart_id, product_id)制約ではなく
    // RLSポリシー(cart_items_write_own)のみによって拒否されることを検証する
    const { error } = await userB.client
      .from('cart_items')
      .insert({ cart_id: cartAId, product_id: productId2, quantity: 1 })
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

  it('customer: 自分のcart_itemsのquantityをUPDATEできる', async () => {
    const { data: item } = await userA.client
      .from('cart_items')
      .select('id')
      .eq('cart_id', cartAId)
      .eq('product_id', productId)
      .single()

    const { error } = await userA.client
      .from('cart_items')
      .update({ quantity: 2 })
      .eq('id', item!.id)
    expect(error).toBeNull()

    const { data: updated } = await userA.client
      .from('cart_items')
      .select('quantity')
      .eq('id', item!.id)
      .single()
    expect(updated?.quantity).toBe(2)
  })

  it('customer: userBはuserAのcart_itemsをUPDATEできない', async () => {
    const { data: item } = await userA.client
      .from('cart_items')
      .select('id')
      .eq('cart_id', cartAId)
      .eq('product_id', productId)
      .single()

    const { data, error } = await userB.client
      .from('cart_items')
      .update({ quantity: 99 })
      .eq('id', item!.id)
      .select()
    expect(error).toBeNull()
    expect(data?.length).toBe(0)
  })
})
