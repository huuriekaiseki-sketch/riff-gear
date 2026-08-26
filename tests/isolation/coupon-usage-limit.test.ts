import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createDummyProduct, cleanupTestData } from '../helpers/test-fixtures'
import { createAdminClient } from '@/lib/supabase/admin'

// usage_limit=1のクーポンを2人が同時に使おうとした場合、成功するのは1人だけで
// used_countは1のまま(2にならない)ことを検証する(分離レベルテスト / Write Skew対策)。
// place_order()はクーポン行をfor updateでロックしてから利用回数を確認するため、
// 後発の呼び出しは先発のコミットを待ってから「上限に達している」を検知できるはず。
describe('クーポン利用回数上限の同時実行', () => {
  let userA: TestUser
  let userB: TestUser
  let productId: string
  let couponCode: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')

    productId = await createDummyProduct({ name: 'クーポン上限テスト用ダミー商品', stock: 10 })
    const adminClient = createAdminClient()

    couponCode = `LIMIT1-${crypto.randomUUID().slice(0, 8)}`
    await adminClient.from('coupons').insert({
      code: couponCode,
      discount_percent: 10,
      active: true,
      usage_limit: 1,
    })

    for (const user of [userA, userB]) {
      const { data: cart } = await user.client
        .from('carts')
        .insert({ user_id: user.id })
        .select('id')
        .single()
      await user.client.from('cart_items').insert({ cart_id: cart!.id, product_id: productId, quantity: 1 })
    }
  })

  afterAll(async () => {
    await cleanupTestData({ userIds: [userA.id, userB.id], productIds: [productId] })
    await createAdminClient().from('coupons').delete().eq('code', couponCode)
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
  })

  it('usage_limit=1のクーポンに2人が同時に注文しても、成功するのは1人だけでused_countは1のまま', async () => {
    const [resultA, resultB] = await Promise.allSettled([
      userA.client.rpc('place_order', { p_payment_method: 'card', p_coupon_code: couponCode }),
      userB.client.rpc('place_order', { p_payment_method: 'card', p_coupon_code: couponCode }),
    ])

    const outcomes = [resultA, resultB].map((r) => {
      if (r.status === 'rejected') return { ok: false }
      return { ok: !r.value.error }
    })

    expect(outcomes.filter((o) => o.ok).length).toBe(1)
    expect(outcomes.filter((o) => !o.ok).length).toBe(1)

    const { data: coupon } = await createAdminClient()
      .from('coupons')
      .select('used_count')
      .eq('code', couponCode)
      .single()
    expect(coupon?.used_count).toBe(1)
  })
})
