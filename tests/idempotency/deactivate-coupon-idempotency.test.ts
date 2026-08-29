import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'

// deactivate_coupon()は「対象が既にactive=falseなら何もせず正常終了する」冪等な設計。
// 再有効化する経路は提供しないため、複数回呼び出してもactive=falseのままであることを検証する。
describe('deactivate_coupon の冪等性', () => {
  let admin: TestUser
  let couponId: string
  const code = `IDEMPOTENCY-TEST-${crypto.randomUUID().slice(0, 8)}`

  beforeAll(async () => {
    admin = await createTestUser('admin')
    const { data, error } = await admin.client.rpc('create_coupon', {
      p_code: code,
      p_discount_percent: 10,
    })
    expect(error).toBeNull()
    couponId = data as string
  })

  afterAll(async () => {
    await createAdminClient().from('coupons').delete().eq('id', couponId)
    await deleteTestUser(admin.id)
  })

  it('同じcoupon_idに逐次3回呼んでもエラーにならず、最終的にactive=falseのまま', async () => {
    const first = await admin.client.rpc('deactivate_coupon', { p_coupon_id: couponId })
    expect(first.error).toBeNull()

    const second = await admin.client.rpc('deactivate_coupon', { p_coupon_id: couponId })
    expect(second.error).toBeNull()

    const third = await admin.client.rpc('deactivate_coupon', { p_coupon_id: couponId })
    expect(third.error).toBeNull()

    const { data: row } = await createAdminClient().from('coupons').select('active').eq('id', couponId).single()
    expect(row?.active).toBe(false)
  })

  it('同じcoupon_idに同時に2回呼んでもエラーにならない', async () => {
    const code2 = `IDEMPOTENCY-TEST-CONCURRENT-${crypto.randomUUID().slice(0, 8)}`
    const { data: id2 } = await admin.client.rpc('create_coupon', { p_code: code2, p_discount_percent: 10 })

    const [a, b] = await Promise.all([
      admin.client.rpc('deactivate_coupon', { p_coupon_id: id2 }),
      admin.client.rpc('deactivate_coupon', { p_coupon_id: id2 }),
    ])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()

    const { data: row } = await createAdminClient().from('coupons').select('active').eq('id', id2!).single()
    expect(row?.active).toBe(false)

    await createAdminClient().from('coupons').delete().eq('id', id2!)
  })

  it('存在しないcoupon_idを指定してもエラーにならない(対象0件でも正常終了)', async () => {
    const { error } = await admin.client.rpc('deactivate_coupon', {
      p_coupon_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).toBeNull()
  })
})
