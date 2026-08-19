import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

describe('reviews RLS', () => {
  let userA: TestUser
  let userB: TestUser
  let admin: TestUser
  let productId: string
  let orderAId: string
  let reviewAId: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')
    admin = await createTestUser('admin')

    // 他テストファイルと在庫を奪い合わないよう、このテスト専用のダミー商品を使う
    const adminClient = createAdminClient()
    const { data: product } = await adminClient
      .from('products')
      .insert({ name: 'reviews.test.ts専用ダミー商品', category: 'accessory', price_cents: 1000, stock: 5 })
      .select('id')
      .single()
    productId = product!.id

    // userAだけがこの商品を実際に購入する(place_order RPCで実注文を作る)
    const { data: cart } = await userA.client.from('carts').insert({ user_id: userA.id }).select('id').single()
    await userA.client.from('cart_items').insert({ cart_id: cart!.id, product_id: productId, quantity: 1 })
    const { data: orderId, error: orderError } = await userA.client.rpc('place_order', { p_payment_method: 'card' })
    expect(orderError).toBeNull()
    orderAId = orderId as string
  })

  afterAll(async () => {
    const adminClient = createAdminClient()
    if (orderAId) {
      await adminClient.from('orders').delete().eq('id', orderAId)
    }
    if (productId) {
      await adminClient.from('reviews').delete().eq('product_id', productId)
      await adminClient.from('cart_items').delete().eq('product_id', productId)
      await adminClient.from('products').delete().eq('id', productId)
    }
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
    await deleteTestUser(admin.id)
  })

  it('customer: 購入済みユーザーはレビューをINSERTできる', async () => {
    const { data, error } = await userA.client
      .from('reviews')
      .insert({ user_id: userA.id, product_id: productId, rating: 5, comment: '最高でした' })
      .select('id')
      .single()
    expect(error).toBeNull()
    reviewAId = data!.id
  })

  it('customer: 未購入ユーザーはレビューをINSERTできない', async () => {
    const { error } = await userB.client
      .from('reviews')
      .insert({ user_id: userB.id, product_id: productId, rating: 3 })
    expect(error).not.toBeNull()
  })

  it('customer: 同じ商品に二重投稿するとunique制約でエラーになる', async () => {
    const { error } = await userA.client
      .from('reviews')
      .insert({ user_id: userA.id, product_id: productId, rating: 4 })
    expect(error).not.toBeNull()
  })

  it('anon相当(userB)でも他人のレビューをSELECTできる(社会的証明のため公開)', async () => {
    const { data, error } = await userB.client.from('reviews').select('id').eq('id', reviewAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it('customer: userBはuserAのレビューをUPDATEできない', async () => {
    const { data, error } = await userB.client
      .from('reviews')
      .update({ rating: 1 })
      .eq('id', reviewAId)
      .select()
    expect(error).toBeNull()
    expect(data?.length).toBe(0)
  })

  it('customer: 自分のレビューはUPDATEできる(上書き投稿)', async () => {
    const { error } = await userA.client.from('reviews').update({ rating: 4 }).eq('id', reviewAId)
    expect(error).toBeNull()
    const { data } = await admin.client.from('reviews').select('rating').eq('id', reviewAId).single()
    expect(data?.rating).toBe(4)
  })

  it('customer: userBはuserAのレビューをDELETEできない', async () => {
    await userB.client.from('reviews').delete().eq('id', reviewAId)
    const { data } = await admin.client.from('reviews').select('id').eq('id', reviewAId)
    expect(data?.length).toBe(1)
  })

  it('customer: 自分のレビューはDELETEできる', async () => {
    const { error } = await userA.client.from('reviews').delete().eq('id', reviewAId)
    expect(error).toBeNull()
    const { data } = await admin.client.from('reviews').select('id').eq('id', reviewAId)
    expect(data?.length).toBe(0)
  })
})
