import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createDummyProduct, cleanupTestData } from '../helpers/test-fixtures'
import { createAdminClient } from '@/lib/supabase/admin'

// 同じidempotency_keyでplace_order()を逐次2回・同時2回呼んでも、
// 注文・在庫減算が1回分だけ反映されることを検証する(冪等性テスト)。
describe('place_order 冪等性', () => {
  let user: TestUser
  let productId: string

  beforeAll(async () => {
    user = await createTestUser('customer')
    productId = await createDummyProduct({ name: '冪等性テスト用ダミー商品', stock: 10 })
  })

  afterAll(async () => {
    await cleanupTestData({ userIds: [user.id], productIds: [productId] })
    await deleteTestUser(user.id)
  })

  async function addItemToCart(quantity: number) {
    const { data: existingCart } = await user.client
      .from('carts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    const cart =
      existingCart ??
      (await user.client.from('carts').insert({ user_id: user.id }).select('id').single()).data
    await user.client.from('cart_items').insert({ cart_id: cart!.id, product_id: productId, quantity })
  }

  it('同じキーで逐次2回呼んでも、2回目は1回目と同じ注文IDが返り在庫は1回分しか減らない', async () => {
    const key = `seq-${crypto.randomUUID()}`
    await addItemToCart(2)

    const first = await user.client.rpc('place_order', { p_payment_method: 'card', p_idempotency_key: key })
    expect(first.error).toBeNull()

    const second = await user.client.rpc('place_order', { p_payment_method: 'card', p_idempotency_key: key })
    expect(second.error).toBeNull()
    expect(second.data).toBe(first.data)

    const { data: orders } = await createAdminClient()
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('idempotency_key', key)
    expect(orders?.length).toBe(1)

    const { data: product } = await createAdminClient()
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()
    expect(product?.stock).toBe(8)
  })

  it('同じキーで同時に2回呼んでも、注文は1件だけ作られ在庫は1回分しか減らない', async () => {
    const key = `concurrent-${crypto.randomUUID()}`
    await addItemToCart(2)

    const [a, b] = await Promise.all([
      user.client.rpc('place_order', { p_payment_method: 'card', p_idempotency_key: key }),
      user.client.rpc('place_order', { p_payment_method: 'card', p_idempotency_key: key }),
    ])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(a.data).toBe(b.data)

    const { data: orders } = await createAdminClient()
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('idempotency_key', key)
    expect(orders?.length).toBe(1)

    const { data: product } = await createAdminClient()
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()
    // 前のテストで在庫8まで減っているので、さらに2引かれて6のはず
    expect(product?.stock).toBe(6)
  })

  it('キーを指定しない従来通りの呼び出しは、毎回別々の注文になる', async () => {
    await addItemToCart(1)
    const first = await user.client.rpc('place_order', { p_payment_method: 'card' })
    expect(first.error).toBeNull()

    await addItemToCart(1)
    const second = await user.client.rpc('place_order', { p_payment_method: 'card' })
    expect(second.error).toBeNull()

    expect(second.data).not.toBe(first.data)
  })
})
