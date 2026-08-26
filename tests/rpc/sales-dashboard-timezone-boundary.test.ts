import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

// get_daily_sales()の日付バケットはcreated_at::dateで決まり、これはDBセッションの
// タイムゾーン設定(Supabaseのデフォルト=UTC)で評価される。つまりJST(UTC+9)で見た
// カレンダー日とは一致しない場合がある(PRテンプレートに記載済みの既知の制約:
// 「JST深夜帯の注文が前日に計上される」)。
//
// この仕様は既に決定済み(JST厳密化はしない)であり、このテストは「決まった仕様通りに
// 動いているか」を固定する回帰テストである。将来DBセッションのタイムゾーン設定や
// get_daily_sales()の実装が変わってこの境界の挙動が変化した場合に検知する。
//
// 「基準日」は実行時の現在日時から2日前(UTC 00:00基準)に固定する。相対日付にすることで、
// テスト実行日によらずget_daily_sales(30日窓)の範囲内に確実に収まるようにしている。
describe('get_daily_sales タイムゾーン境界', () => {
  let admin: TestUser
  let customer: TestUser
  const orderIds: string[] = []

  // UTC日付が切り替わる境界そのもの(00:00:00Z)を跨いだ2件の注文の目印金額
  const UTC_MIDNIGHT_EXACT_TOTAL_CENTS = 1_500_000_000
  const JST_LATE_NIGHT_TOTAL_CENTS = 1_600_000_000

  let baseDayIso: string
  let previousDayIso: string

  beforeAll(async () => {
    admin = await createTestUser('admin')
    customer = await createTestUser('customer')

    const now = new Date()
    // 「基準日(D)」= 現在時刻から2日前のUTC日付の00:00:00Z
    const baseDayUtcMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2, 0, 0, 0)
    )
    baseDayIso = baseDayUtcMidnight.toISOString().slice(0, 10)
    const previousDayUtcMidnight = new Date(baseDayUtcMidnight.getTime() - 24 * 60 * 60 * 1000)
    previousDayIso = previousDayUtcMidnight.toISOString().slice(0, 10)

    // ケース1: UTC 00:00:00Zちょうど(=基準日Dの開始時刻)。sales_date = D になるべき。
    const utcMidnightExact = baseDayUtcMidnight

    // ケース2: UTC前日15:30Z(=JSTでは基準日Dの00:30、つまりJSTのカレンダー上ではDの深夜0時台)。
    // このRPCはUTC日付でバケットするため、sales_date = D-1(前日) になるべき
    // (JSTのカレンダー感覚とはズレる、既知の制約)。
    const jstLateNight = new Date(baseDayUtcMidnight.getTime() - 8.5 * 60 * 60 * 1000)

    const adminClient = createAdminClient()
    const { data: orders, error } = await adminClient
      .from('orders')
      .insert([
        {
          user_id: customer.id,
          status: 'shipped',
          total_cents: UTC_MIDNIGHT_EXACT_TOTAL_CENTS,
          payment_method: 'bank_transfer',
          payment_status: 'paid',
          created_at: utcMidnightExact.toISOString(),
        },
        {
          user_id: customer.id,
          status: 'shipped',
          total_cents: JST_LATE_NIGHT_TOTAL_CENTS,
          payment_method: 'bank_transfer',
          payment_status: 'paid',
          created_at: jstLateNight.toISOString(),
        },
      ])
      .select('id')
    if (error || !orders) {
      throw new Error(`テスト注文の作成に失敗: ${error?.message}`)
    }
    for (const o of orders) orderIds.push(o.id)
  })

  afterAll(async () => {
    const adminClient = createAdminClient()
    for (const id of orderIds) {
      await adminClient.from('orders').delete().eq('id', id)
    }
    await deleteTestUser(admin.id)
    await deleteTestUser(customer.id)
  })

  it('UTC 00:00:00Zちょうどの注文は、その日(基準日D)のバケットに計上される', async () => {
    const { data, error } = await admin.client.rpc('get_daily_sales', { days: 30 })
    expect(error).toBeNull()
    const rows = data as { sales_date: string; total_cents: number }[]

    const baseDayRow = rows.find((r) => r.sales_date === baseDayIso)
    expect(baseDayRow).toBeDefined()
    expect(baseDayRow!.total_cents).toBeGreaterThanOrEqual(UTC_MIDNIGHT_EXACT_TOTAL_CENTS)
  })

  it('JST深夜0時台(UTC前日15:30)の注文は、UTC基準で前日のバケットに計上される(既知の仕様)', async () => {
    const { data, error } = await admin.client.rpc('get_daily_sales', { days: 30 })
    expect(error).toBeNull()
    const rows = data as { sales_date: string; total_cents: number }[]

    const previousDayRow = rows.find((r) => r.sales_date === previousDayIso)
    expect(previousDayRow).toBeDefined()
    expect(previousDayRow!.total_cents).toBeGreaterThanOrEqual(JST_LATE_NIGHT_TOTAL_CENTS)

    // 基準日Dの方には、この注文の金額は含まれていないこと
    const baseDayRow = rows.find((r) => r.sales_date === baseDayIso)
    if (baseDayRow) {
      expect(baseDayRow.total_cents).toBeLessThan(JST_LATE_NIGHT_TOTAL_CENTS)
    }
  })
})
