import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createDummyProduct, cleanupTestData } from '../helpers/test-fixtures'
import { createAdminClient } from '@/lib/supabase/admin'

// place_order() の支払い方法(payment_method)引数と、それに応じたpayment_statusの初期値を検証する。
// card/qr_codeは即時決済完了想定でpaid、bank_transfer/cod/convenience_storeは
// 入金・支払い確認が後日必要なためpendingになる。
describe('place_order の支払い方法とpayment_status', () => {
  let user: TestUser
  let productId: string

  beforeAll(async () => {
    user = await createTestUser('customer')
    productId = await createDummyProduct({ name: '決済テスト用ダミー商品', stock: 10 })
  })

  afterAll(async () => {
    await cleanupTestData({ userIds: [user.id], productIds: [productId] })
    await deleteTestUser(user.id)
  })

  async function addItemToCart() {
    const { data: existingCart } = await user.client
      .from('carts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    const cart =
      existingCart ??
      (await user.client.from('carts').insert({ user_id: user.id }).select('id').single()).data
    await user.client.from('cart_items').insert({ cart_id: cart!.id, product_id: productId, quantity: 1 })
  }

  it.each([
    ['card', 'paid'],
    ['qr_code', 'paid'],
    ['bank_transfer', 'pending'],
    ['cod', 'pending'],
    ['convenience_store', 'pending'],
  ])('payment_method=%s のときpayment_status=%sになる', async (method, expectedStatus) => {
    await addItemToCart()
    const { data: orderId, error } = await user.client.rpc('place_order', { p_payment_method: method })
    expect(error).toBeNull()

    const { data: order } = await createAdminClient()
      .from('orders')
      .select('payment_method, payment_status')
      .eq('id', orderId as string)
      .single()
    expect(order?.payment_method).toBe(method)
    expect(order?.payment_status).toBe(expectedStatus)
  })

  it('不正なpayment_methodはエラーになる', async () => {
    await addItemToCart()
    const { error } = await user.client.rpc('place_order', { p_payment_method: 'paypal' })
    expect(error).not.toBeNull()
  })
})
