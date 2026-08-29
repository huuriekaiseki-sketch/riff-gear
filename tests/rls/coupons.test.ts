import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'

// create_coupon/deactivate_coupon はsecurity invokerで実装されており、
// 「coupons_write_admin_only」RLSポリシーと関数内is_admin()チェックの二重防御になっている。
// ここでは一般customerとanon(未ログイン)がどちらのRPCも呼べないことを検証する。
describe('coupons admin RPC の認可', () => {
  let customer: TestUser
  let admin: TestUser
  let anon: SupabaseClient

  beforeAll(async () => {
    customer = await createTestUser('customer')
    admin = await createTestUser('admin')
    anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  })

  afterAll(async () => {
    await createAdminClient().from('coupons').delete().like('code', 'RLS-TEST-%')
    await deleteTestUser(customer.id)
    await deleteTestUser(admin.id)
  })

  it('customer: create_couponは拒否される', async () => {
    const { data, error } = await customer.client.rpc('create_coupon', {
      p_code: `RLS-TEST-CUSTOMER-${crypto.randomUUID().slice(0, 8)}`,
      p_discount_percent: 10,
    })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('anon: create_couponは拒否される', async () => {
    const { data, error } = await anon.rpc('create_coupon', {
      p_code: `RLS-TEST-ANON-${crypto.randomUUID().slice(0, 8)}`,
      p_discount_percent: 10,
    })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('admin: create_couponは成功する', async () => {
    const code = `RLS-TEST-ADMIN-${crypto.randomUUID().slice(0, 8)}`
    const { data, error } = await admin.client.rpc('create_coupon', {
      p_code: code,
      p_discount_percent: 20,
    })
    expect(error).toBeNull()
    expect(data).not.toBeNull()

    const { data: row } = await createAdminClient().from('coupons').select('code, active').eq('id', data!).single()
    expect(row?.code).toBe(code)
    expect(row?.active).toBe(true)
  })

  it('customer: deactivate_couponは拒否される(管理者作成のクーポンに対して)', async () => {
    const code = `RLS-TEST-TARGET-${crypto.randomUUID().slice(0, 8)}`
    const { data: couponId } = await admin.client.rpc('create_coupon', {
      p_code: code,
      p_discount_percent: 15,
    })

    const { error } = await customer.client.rpc('deactivate_coupon', { p_coupon_id: couponId })
    expect(error).not.toBeNull()

    const { data: row } = await createAdminClient().from('coupons').select('active').eq('id', couponId!).single()
    expect(row?.active).toBe(true)
  })

  it('anon: deactivate_couponは拒否される', async () => {
    const code = `RLS-TEST-TARGET2-${crypto.randomUUID().slice(0, 8)}`
    const { data: couponId } = await admin.client.rpc('create_coupon', {
      p_code: code,
      p_discount_percent: 15,
    })

    const { error } = await anon.rpc('deactivate_coupon', { p_coupon_id: couponId })
    expect(error).not.toBeNull()

    const { data: row } = await createAdminClient().from('coupons').select('active').eq('id', couponId!).single()
    expect(row?.active).toBe(true)
  })

  it('admin: deactivate_couponは成功する', async () => {
    const code = `RLS-TEST-DEACTIVATE-${crypto.randomUUID().slice(0, 8)}`
    const { data: couponId } = await admin.client.rpc('create_coupon', {
      p_code: code,
      p_discount_percent: 15,
    })

    const { error } = await admin.client.rpc('deactivate_coupon', { p_coupon_id: couponId })
    expect(error).toBeNull()

    const { data: row } = await createAdminClient().from('coupons').select('active').eq('id', couponId!).single()
    expect(row?.active).toBe(false)
  })
})
