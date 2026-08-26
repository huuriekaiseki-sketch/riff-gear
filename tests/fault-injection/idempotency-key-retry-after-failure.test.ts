import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createDummyProduct, cleanupTestData } from '../helpers/test-fixtures'
import { createAdminClient } from '@/lib/supabase/admin'

// 冪等キーは「同じキーでの2回目の呼び出しは1回目と同じ注文を返す」ためのものだが、
// 1回目の呼び出し自体が(無効なクーポン等で)失敗した場合、そのキーでは注文行が
// 作られていない。もしこの状態でキーが「使用済み」として扱われてしまうと、
// クライアントは同じキーで正しいリトライができなくなる(キーが失敗状態のまま
// 固着してしまう障害)。
//
// この障害注入テストは、1回目を意図的に失敗させた後、同じキーで2回目を呼び、
// 新規注文として正常に成立することを検証する。
describe('place_order 障害注入: 冪等キーは失敗した試行に汚染されない', () => {
  let user: TestUser
  let productId: string

  beforeAll(async () => {
    user = await createTestUser('customer')
    productId = await createDummyProduct({ name: '冪等キー再試行テスト用ダミー商品' })
  })

  afterAll(async () => {
    await cleanupTestData({ userIds: [user.id], productIds: [productId] })
    await deleteTestUser(user.id)
  })

  it('同じキーで1回目が失敗しても、2回目は新規注文として成立する', async () => {
    const key = `retry-after-failure-${crypto.randomUUID()}`
    const adminClient = createAdminClient()

    const { data: cart } = await user.client
      .from('carts')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    await user.client.from('cart_items').insert({ cart_id: cart!.id, product_id: productId, quantity: 2 })

    // 1回目: 無効なクーポンコードで意図的に失敗させる
    const first = await user.client.rpc('place_order', {
      p_payment_method: 'card',
      p_coupon_code: '存在しないクーポンコード',
      p_idempotency_key: key,
    })
    expect(first.error).not.toBeNull()

    const { data: stockAfterFailure } = await adminClient
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()
    expect(stockAfterFailure?.stock).toBe(5)

    // 1回目の失敗で注文行が作られていないため、この時点でこのキーに紐づく注文は無い
    const { data: ordersAfterFailure } = await adminClient
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('idempotency_key', key)
    expect(ordersAfterFailure?.length).toBe(0)

    // 2回目: 同じキーでクーポン無しで再試行する。cart_itemsは1回目の失敗で
    // ロールバックされ残っているため、そのまま使える
    const second = await user.client.rpc('place_order', {
      p_payment_method: 'card',
      p_idempotency_key: key,
    })
    expect(second.error).toBeNull()

    const { data: ordersAfterRetry } = await adminClient
      .from('orders')
      .select('id, total_cents')
      .eq('user_id', user.id)
      .eq('idempotency_key', key)
    expect(ordersAfterRetry?.length).toBe(1)
    expect(ordersAfterRetry?.[0].total_cents).toBe(2000)

    const { data: stockAfterRetry } = await adminClient
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()
    expect(stockAfterRetry?.stock).toBe(3)
  })
})
