import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

// cancel_order() RPCの検証。receivedステータスの自分の注文だけキャンセルでき、
// 在庫が復元されることを確認する。他人の注文・received以外の注文は拒否される。
describe('cancel_order RPC', () => {
  let userA: TestUser
  let userB: TestUser
  let productId: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')

    const adminClient = createAdminClient()
    const { data: product, error } = await adminClient
      .from('products')
      .insert({
        name: 'キャンセルテスト用ダミー商品',
        category: 'accessory',
        price_cents: 1000,
        stock: 5,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    productId = product!.id
  })

  afterAll(async () => {
    const adminClient = createAdminClient()

    const { data: orders } = await adminClient
      .from('orders')
      .select('id')
      .in('user_id', [userA.id, userB.id])
    if (orders && orders.length > 0) {
      await adminClient
        .from('orders')
        .delete()
        .in('id', orders.map((o) => o.id))
    }
    await adminClient.from('cart_items').delete().eq('product_id', productId)
    await adminClient.from('products').delete().eq('id', productId)

    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
  })

  async function placeOrderAs(user: TestUser, quantity: number) {
    // 同じユーザーで複数回注文する場合があるため、既存カート(carts.user_idはunique)を再利用する
    const { data: existingCart } = await user.client
      .from('carts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    const cart =
      existingCart ??
      (
        await user.client.from('carts').insert({ user_id: user.id }).select('id').single()
      ).data
    await user.client.from('cart_items').insert({
      cart_id: cart!.id,
      product_id: productId,
      quantity,
    })
    const { data: orderId, error } = await user.client.rpc('place_order', { p_payment_method: 'card' })
    expect(error).toBeNull()
    return orderId as string
  }

  it('received状態の自分の注文はキャンセルでき、在庫が復元される', async () => {
    const adminClient = createAdminClient()
    const { data: before } = await adminClient
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()

    const orderId = await placeOrderAs(userA, 2)

    const { error: cancelError } = await userA.client.rpc('cancel_order', { p_order_id: orderId })
    expect(cancelError).toBeNull()

    const { data: order } = await adminClient
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()
    expect(order?.status).toBe('cancelled')

    const { data: after } = await adminClient
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()
    expect(after?.stock).toBe(before?.stock)
  })

  it('他人の注文はキャンセルできない', async () => {
    const orderId = await placeOrderAs(userA, 1)

    const { error } = await userB.client.rpc('cancel_order', { p_order_id: orderId })
    expect(error).not.toBeNull()

    const { data: order } = await createAdminClient()
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()
    expect(order?.status).toBe('received')
  })

  it('received以外(preparing)の注文はキャンセルできない', async () => {
    const orderId = await placeOrderAs(userA, 1)
    const adminClient = createAdminClient()
    await adminClient.from('orders').update({ status: 'preparing' }).eq('id', orderId)

    const { error } = await userA.client.rpc('cancel_order', { p_order_id: orderId })
    expect(error).not.toBeNull()

    const { data: order } = await adminClient
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()
    expect(order?.status).toBe('preparing')
  })
})
