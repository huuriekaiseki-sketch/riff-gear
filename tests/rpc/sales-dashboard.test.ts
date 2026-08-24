import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

// 売上ダッシュボードRPC(get_daily_sales / get_product_sales_summary)の認可・集計の回帰テスト。
// PR #83時点ではcurlによる手動検証だったシナリオを自動化したもの。
// マイグレーションやRLS/関数の変更でこの認可境界が壊れた場合に検知する。
//
// 集計定義の明文化(このテストが仕様の正):
// - 「売上」= orders.status が 'cancelled' 以外の全注文。payment_status(pending/paid)は問わない。
// - 日別集計の日付バケットは created_at のUTC日付(created_at::date)。JSTではない。
//
// 集計RPCは全注文を横断するため、並列実行される他のテストが作る注文と結果が混ざる。
// そこで金額アサーションには他のテストが到達し得ない巨大な金額を使い、
// 商品別アサーションにはこのテスト専用のダミー商品を使って分離する。
// 金額はorders.total_centsがinteger型(上限約21.4億)なのでint4に収まる値にする。
const SHIPPED_TOTAL_CENTS = 1_000_000_000 // 含まれるべき注文(shipped)の目印
const OLD_TOTAL_CENTS = 1_900_000_000 // 30日窓の外(40日前)の注文の目印
const CANCELLED_TOTAL_CENTS = 2_000_000_000 // 除外されるべき注文(cancelled)の目印

describe('sales dashboard RPCs', () => {
  let customer: TestUser
  let admin: TestUser
  let productAId: string
  let productBId: string
  const orderIds: string[] = []

  beforeAll(async () => {
    customer = await createTestUser('customer')
    admin = await createTestUser('admin')

    const adminClient = createAdminClient()
    const { data: products } = await adminClient
      .from('products')
      .insert([
        { name: 'sales-dashboard.test.ts専用ダミー商品A', category: 'accessory', price_cents: 500, stock: 10 },
        { name: 'sales-dashboard.test.ts専用ダミー商品B', category: 'accessory', price_cents: 700, stock: 10 },
      ])
      .select('id, name')
    productAId = products!.find((p) => p.name.endsWith('A'))!.id
    productBId = products!.find((p) => p.name.endsWith('B'))!.id

    // service roleで注文を直接作成する(place_order経由だとcreated_atを操作できないため)。
    // shipped: 集計に含まれる / cancelled: 除外される / 40日前: 30日窓の外
    const now = new Date()
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    const { data: orders, error: ordersError } = await adminClient
      .from('orders')
      .insert([
        {
          user_id: customer.id,
          status: 'shipped',
          total_cents: SHIPPED_TOTAL_CENTS,
          payment_method: 'bank_transfer',
          payment_status: 'pending', // pendingでも集計対象であること(payment_status不問)を兼ねる
          created_at: now.toISOString(),
        },
        {
          user_id: customer.id,
          status: 'cancelled',
          total_cents: CANCELLED_TOTAL_CENTS,
          payment_method: 'bank_transfer',
          payment_status: 'pending',
          created_at: now.toISOString(),
        },
        {
          user_id: customer.id,
          status: 'shipped',
          total_cents: OLD_TOTAL_CENTS,
          payment_method: 'bank_transfer',
          payment_status: 'paid',
          created_at: fortyDaysAgo.toISOString(),
        },
      ])
      .select('id, status, total_cents')
    if (ordersError || !orders) {
      throw new Error(`テスト注文の作成に失敗: ${ordersError?.message}`)
    }
    for (const o of orders) orderIds.push(o.id)

    const shippedId = orders!.find((o) => o.total_cents === SHIPPED_TOTAL_CENTS)!.id
    const cancelledId = orders!.find((o) => o.total_cents === CANCELLED_TOTAL_CENTS)!.id
    await adminClient.from('order_items').insert([
      // 商品A: shipped注文で2個 → 商品別集計に sales_count=2, total=1000 で出るべき
      { order_id: shippedId, product_id: productAId, quantity: 2, price_cents_at_order: 500 },
      // 商品B: cancelled注文のみ → 商品別集計に出ないべき
      { order_id: cancelledId, product_id: productBId, quantity: 1, price_cents_at_order: 700 },
    ])
  })

  afterAll(async () => {
    const adminClient = createAdminClient()
    // order_itemsはorders.idへのon delete cascadeで連鎖削除される
    for (const id of orderIds) {
      await adminClient.from('orders').delete().eq('id', id)
    }
    await adminClient.from('products').delete().eq('id', productAId)
    await adminClient.from('products').delete().eq('id', productBId)
    await deleteTestUser(customer.id)
    await deleteTestUser(admin.id)
  })

  it('anon: get_daily_salesはpermission deniedで失敗する', async () => {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error } = await anonClient.rpc('get_daily_sales', { days: 30 })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('customer(非管理者): 両RPCともpermission deniedで失敗する', async () => {
    const daily = await customer.client.rpc('get_daily_sales', { days: 30 })
    expect(daily.error).not.toBeNull()
    expect(daily.data).toBeNull()

    const summary = await customer.client.rpc('get_product_sales_summary')
    expect(summary.error).not.toBeNull()
    expect(summary.data).toBeNull()
  })

  it('admin: get_daily_salesが取得でき、cancelledと30日窓の外の注文は含まれない', async () => {
    const { data, error } = await admin.client.rpc('get_daily_sales', { days: 30 })
    expect(error).toBeNull()
    const rows = data as { sales_date: string; total_cents: number; order_count: number }[]

    // shipped注文(今日)が計上されている日が存在する
    const shippedDay = rows.find((r) => r.total_cents >= SHIPPED_TOTAL_CENTS)
    expect(shippedDay).toBeDefined()
    expect(shippedDay!.order_count).toBeGreaterThanOrEqual(1)

    // cancelled注文(20億)・40日前の注文(19億)の巨大金額はどの日にも計上されていない。
    // shipped(10億)＋他テストの並行注文(数千〜数十万セント規模)では19億に達しないため、
    // この閾値以上の日があればcancelled混入か窓外混入とみなせる
    for (const r of rows) {
      expect(r.total_cents).toBeLessThan(OLD_TOTAL_CENTS)
    }
  })

  it('admin: get_product_sales_summaryが取得でき、cancelled注文のみの商品は含まれない', async () => {
    const { data, error } = await admin.client.rpc('get_product_sales_summary')
    expect(error).toBeNull()
    const rows = data as {
      product_id: string
      product_name: string
      sales_count: number
      total_cents: number
    }[]

    // 商品A(shipped注文で2個)は専用商品なので集計値が完全に一致する
    const rowA = rows.find((r) => r.product_id === productAId)
    expect(rowA).toBeDefined()
    expect(rowA!.sales_count).toBe(2)
    expect(rowA!.total_cents).toBe(1000)

    // 商品B(cancelled注文のみ)は集計に現れない
    expect(rows.find((r) => r.product_id === productBId)).toBeUndefined()
  })
})
