import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

// 同時注文時に在庫が「横取り」されて二重販売にならないかを検証する。
// place_order() は FOR UPDATE で商品行をロックしてから在庫チェック→減算を行うため、
// 在庫1個の商品に2人が同時にplace_orderを呼んでも、成功するのは1人だけであるべき。
describe('place_order 同時実行時の在庫排他制御', () => {
  let userA: TestUser
  let userB: TestUser
  let productId: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')

    // 他のテスト・シードデータに影響しないよう、このテスト専用の在庫1個の商品を作る
    const adminClient = createAdminClient()
    const { data: product, error } = await adminClient
      .from('products')
      .insert({
        name: '同時実行テスト用ダミー商品',
        category: 'accessory',
        price_cents: 1000,
        stock: 1,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    productId = product!.id

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
    const adminClient = createAdminClient()

    // orders.user_idにon delete cascadeが無いため、注文を先に明示的に削除してからユーザーを消す
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

    // place_orderに失敗した側のカートには商品がカート内に残ったままなので、
    // productsテーブルを削除する前にcart_itemsの参照を明示的に消しておく
    // (cart_items.product_idにはON DELETE CASCADEが無いため)
    await adminClient.from('cart_items').delete().eq('product_id', productId)

    await adminClient.from('products').delete().eq('id', productId)

    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
  })

  it('在庫1個の商品に2人が同時に注文しても、成功するのは1人だけで在庫は0のまま(マイナスにならない)', async () => {
    const [resultA, resultB] = await Promise.allSettled([
      userA.client.rpc('place_order'),
      userB.client.rpc('place_order'),
    ])

    const outcomes = [resultA, resultB].map((r) => {
      if (r.status === 'rejected') return { ok: false, error: r.reason }
      return { ok: !r.value.error, error: r.value.error }
    })

    const successCount = outcomes.filter((o) => o.ok).length
    const failureCount = outcomes.filter((o) => !o.ok).length

    // ちょうど1人だけ成功し、もう1人は在庫不足で拒否される
    expect(successCount).toBe(1)
    expect(failureCount).toBe(1)

    const failed = outcomes.find((o) => !o.ok)
    expect(failed?.error?.message ?? '').toMatch(/在庫不足/)

    // 在庫はちょうど0になっており、マイナスや2重減算になっていないことを確認
    const { data: finalProduct } = await createAdminClient()
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()
    expect(finalProduct?.stock).toBe(0)
  })
})
