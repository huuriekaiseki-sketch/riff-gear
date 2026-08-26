import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createDummyProduct, cleanupTestData } from '../helpers/test-fixtures'
import { createAdminClient } from '@/lib/supabase/admin'

// place_order()は「在庫減算(products更新)」の後に「クーポン検証」を行う
// (supabase/migrations/0017_coupons.sql参照)。無効なクーポンコードを渡すと
// 在庫減算が完了した後にraise exceptionが発生する、実際に存在するコードパスであり、
// これを「在庫減算後のDBエラー」の障害注入として利用できる。
//
// place_order()は単一のPL/pgSQL関数呼び出し(security definer)であり、
// 関数内で例外が発生すると呼び出し全体が暗黙のトランザクションとしてロールバックされる。
// 合格条件: 在庫・cart_items・orders・order_itemsが呼び出し前の状態から一切変化しないこと。
describe('place_order 障害注入: 在庫減算後のクーポン検証失敗', () => {
  let user: TestUser
  let productId: string

  beforeAll(async () => {
    user = await createTestUser('customer')
    productId = await createDummyProduct({ name: '障害注入テスト用ダミー商品' })
  })

  afterAll(async () => {
    await cleanupTestData({ productIds: [productId] })
    await deleteTestUser(user.id)
  })

  it('無効なクーポンコードによる失敗で、在庫減算を含む全ての変更がロールバックされる', async () => {
    const adminClient = createAdminClient()

    const { data: cart } = await user.client
      .from('carts')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    await user.client.from('cart_items').insert({ cart_id: cart!.id, product_id: productId, quantity: 2 })

    const { data: stockBefore } = await adminClient
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()
    expect(stockBefore?.stock).toBe(5)

    const { error } = await user.client.rpc('place_order', {
      p_payment_method: 'card',
      p_coupon_code: '存在しないクーポンコード',
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/無効なクーポンコード/)

    // 在庫はループ内で一度減算されているはずだが、例外により呼び出し全体がロールバックされ
    // 呼び出し前の値(5)に戻っていること
    const { data: stockAfter } = await adminClient
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()
    expect(stockAfter?.stock).toBe(5)

    // cart_itemsは削除されず残っている(注文が成立していないため)
    const { data: cartItems } = await adminClient
      .from('cart_items')
      .select('quantity')
      .eq('cart_id', cart!.id)
    expect(cartItems?.length).toBe(1)
    expect(cartItems?.[0].quantity).toBe(2)

    // ordersもorder_itemsも作成されていない
    const { data: orders } = await adminClient.from('orders').select('id').eq('user_id', user.id)
    expect(orders?.length).toBe(0)
  })
})
