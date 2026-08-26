import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'

// order_items.quantityにはCHECK制約が無かった(cart_itemsには`check (quantity > 0)`がある)。
// place_order()は常にcart_itemsから明細を作るためアプリ経由では0以下の数量が入らないが、
// 管理画面やバッチ等アプリを経由しない書き込み経路ができた場合に備え、
// アプリのバリデーションを迂回してDBへ直接不正な数量を投入し、DB制約自体が拒否することを検証する。
describe('order_items.quantity 制約', () => {
  let user: TestUser
  let productId: string
  let orderId: string

  beforeAll(async () => {
    user = await createTestUser('customer')

    const adminClient = createAdminClient()
    const { data: product, error: productError } = await adminClient
      .from('products')
      .insert({
        name: '制約テスト用ダミー商品',
        category: 'accessory',
        price_cents: 1000,
        stock: 5,
      })
      .select('id')
      .single()
    expect(productError).toBeNull()
    productId = product!.id

    const { data: cart } = await user.client
      .from('carts')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    await user.client.from('cart_items').insert({ cart_id: cart!.id, product_id: productId, quantity: 1 })

    const { data: placedOrderId, error: orderError } = await user.client.rpc('place_order', {
      p_payment_method: 'card',
    })
    expect(orderError).toBeNull()
    orderId = placedOrderId as string
  })

  afterAll(async () => {
    const adminClient = createAdminClient()

    if (orderId) {
      await adminClient.from('orders').delete().eq('id', orderId)
    }
    if (productId) {
      await adminClient.from('cart_items').delete().eq('product_id', productId)
      await adminClient.from('products').delete().eq('id', productId)
    }

    await deleteTestUser(user.id)
  })

  it('quantity=0のorder_itemはDB制約で拒否される', async () => {
    const { error } = await createAdminClient()
      .from('order_items')
      .insert({ order_id: orderId, product_id: productId, quantity: 0, price_cents_at_order: 1000 })
    expect(error).not.toBeNull()
  })

  it('quantity=-1のorder_itemはDB制約で拒否される', async () => {
    const { error } = await createAdminClient()
      .from('order_items')
      .insert({ order_id: orderId, product_id: productId, quantity: -1, price_cents_at_order: 1000 })
    expect(error).not.toBeNull()
  })

  it('拒否された後も既存のorder_itemsは変化しない', async () => {
    const { data } = await createAdminClient()
      .from('order_items')
      .select('id, quantity')
      .eq('order_id', orderId)
    expect(data?.length).toBe(1)
    expect(data?.[0].quantity).toBe(1)
  })
})
