import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

// place_order()/cancel_order()を「注文→一部キャンセル→再注文→クーポン適用注文」のような
// ランダムな操作列で何度も実行し、個々のシナリオではなく「どんな操作順でも崩れてはいけない式」を検査する。
// - 在庫 = 初期在庫 - キャンセルされていない注文の合計数量
// - 各注文のtotal_cents = 明細合計(クーポン適用時は割引後、place_order()のtruncと同じ整数演算)
//
// 各fast-check runごとにDB上へ専用の商品・クーポン・ユーザーを作り直す(他テストファイルと在庫を奪い合わないため)。
// DB往復を伴うため件数は絞ってある: numRuns=10 × maxCommands=6 で最大60コマンド。

const INITIAL_STOCK = 30
const PRICE_CENTS = 1000
const DISCOUNT_PERCENT = 10

type OrderRecord = { id: string; quantity: number; totalCents: number; cancelled: boolean }
type Model = { stock: number; orders: OrderRecord[] }
type Real = { user: TestUser; productId: string; couponCode: string }

function expectedTotal(quantity: number, useCoupon: boolean): number {
  const raw = PRICE_CENTS * quantity
  if (!useCoupon) return raw
  return raw - Math.trunc((raw * DISCOUNT_PERCENT) / 100)
}

class PlaceOrderCommand implements fc.AsyncCommand<Model, Real> {
  constructor(
    private readonly quantity: number,
    private readonly useCoupon: boolean
  ) {}

  check(model: Model): boolean {
    return this.quantity <= model.stock
  }

  async run(model: Model, real: Real): Promise<void> {
    const { data: existingCart } = await real.user.client
      .from('carts')
      .select('id')
      .eq('user_id', real.user.id)
      .maybeSingle()
    const cart =
      existingCart ??
      (await real.user.client.from('carts').insert({ user_id: real.user.id }).select('id').single()).data
    await real.user.client
      .from('cart_items')
      .insert({ cart_id: cart!.id, product_id: real.productId, quantity: this.quantity })

    const { data: orderId, error } = await real.user.client.rpc('place_order', {
      p_payment_method: 'card',
      p_coupon_code: this.useCoupon ? real.couponCode : null,
    })
    expect(error).toBeNull()

    const total = expectedTotal(this.quantity, this.useCoupon)
    const { data: order } = await createAdminClient()
      .from('orders')
      .select('total_cents')
      .eq('id', orderId as string)
      .single()
    expect(order?.total_cents).toBe(total)

    model.stock -= this.quantity
    model.orders.push({ id: orderId as string, quantity: this.quantity, totalCents: total, cancelled: false })

    const { data: product } = await createAdminClient()
      .from('products')
      .select('stock')
      .eq('id', real.productId)
      .single()
    expect(product?.stock).toBe(model.stock)
  }

  toString(): string {
    return `placeOrder(quantity=${this.quantity}, coupon=${this.useCoupon})`
  }
}

class CancelOrderCommand implements fc.AsyncCommand<Model, Real> {
  constructor(private readonly pickIndex: number) {}

  check(model: Model): boolean {
    return model.orders.some((o) => !o.cancelled)
  }

  async run(model: Model, real: Real): Promise<void> {
    const active = model.orders.filter((o) => !o.cancelled)
    const target = active[this.pickIndex % active.length]

    const { error } = await real.user.client.rpc('cancel_order', { p_order_id: target.id })
    expect(error).toBeNull()

    target.cancelled = true
    model.stock += target.quantity

    const { data: product } = await createAdminClient()
      .from('products')
      .select('stock')
      .eq('id', real.productId)
      .single()
    expect(product?.stock).toBe(model.stock)
  }

  toString(): string {
    return `cancelOrder(#${this.pickIndex})`
  }
}

describe('注文ライフサイクルの不変条件(Property-Based)', () => {
  it(
    'どんな注文/キャンセル/クーポン適用の順序でも 在庫=初期在庫-非キャンセル注文合計 が崩れない',
    async () => {
      const allCommands = [
        fc
          .tuple(fc.integer({ min: 1, max: 3 }), fc.boolean())
          .map(([quantity, useCoupon]) => new PlaceOrderCommand(quantity, useCoupon)),
        fc.nat().map((i) => new CancelOrderCommand(i)),
      ]

      await fc.assert(
        fc.asyncProperty(fc.commands(allCommands, { maxCommands: 6 }), async (cmds) => {
          const user = await createTestUser('customer')
          const adminClient = createAdminClient()

          const { data: product } = await adminClient
            .from('products')
            .insert({
              name: '不変条件テスト用ダミー商品',
              category: 'accessory',
              price_cents: PRICE_CENTS,
              stock: INITIAL_STOCK,
            })
            .select('id')
            .single()
          const productId = product!.id

          const couponCode = `INVTEST-${Math.random().toString(36).slice(2, 10)}`
          await adminClient.from('coupons').insert({
            code: couponCode,
            discount_percent: DISCOUNT_PERCENT,
            active: true,
          })

          try {
            const real: Real = { user, productId, couponCode }
            const setup = () => ({ model: { stock: INITIAL_STOCK, orders: [] as OrderRecord[] }, real })
            await fc.asyncModelRun(setup, cmds)
          } finally {
            const { data: orders } = await adminClient.from('orders').select('id').eq('user_id', user.id)
            if (orders && orders.length > 0) {
              await adminClient
                .from('orders')
                .delete()
                .in('id', orders.map((o) => o.id))
            }
            await adminClient.from('cart_items').delete().eq('product_id', productId)
            await adminClient.from('products').delete().eq('id', productId)
            await adminClient.from('coupons').delete().eq('code', couponCode)
            await deleteTestUser(user.id)
          }
        }),
        { numRuns: 10 }
      )
    },
    60000
  )
})
