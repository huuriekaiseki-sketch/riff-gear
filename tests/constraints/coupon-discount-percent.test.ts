import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'

// create_coupon()のdiscount_percent範囲チェック(1〜100)と、codeのunique制約違反時に
// わかりやすいエラーメッセージを返すことを検証する。範囲チェックは関数内の早期validateと
// テーブルのcheck制約の二重防御になっているため、関数呼び出し経由でも拒否されることを確認する。
describe('create_coupon の制約', () => {
  let admin: TestUser

  beforeAll(async () => {
    admin = await createTestUser('admin')
  })

  afterAll(async () => {
    await createAdminClient().from('coupons').delete().like('code', 'CONSTRAINT-TEST-%')
    await deleteTestUser(admin.id)
  })

  it('discount_percent=0は拒否される', async () => {
    const { data, error } = await admin.client.rpc('create_coupon', {
      p_code: `CONSTRAINT-TEST-ZERO-${crypto.randomUUID().slice(0, 8)}`,
      p_discount_percent: 0,
    })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('discount_percent=101は拒否される', async () => {
    const { data, error } = await admin.client.rpc('create_coupon', {
      p_code: `CONSTRAINT-TEST-OVER-${crypto.randomUUID().slice(0, 8)}`,
      p_discount_percent: 101,
    })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('discount_percent=-1は拒否される', async () => {
    const { data, error } = await admin.client.rpc('create_coupon', {
      p_code: `CONSTRAINT-TEST-NEG-${crypto.randomUUID().slice(0, 8)}`,
      p_discount_percent: -1,
    })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('discount_percent=1, 100の境界値は成功する', async () => {
    const codeLow = `CONSTRAINT-TEST-LOW-${crypto.randomUUID().slice(0, 8)}`
    const { error: lowError } = await admin.client.rpc('create_coupon', {
      p_code: codeLow,
      p_discount_percent: 1,
    })
    expect(lowError).toBeNull()

    const codeHigh = `CONSTRAINT-TEST-HIGH-${crypto.randomUUID().slice(0, 8)}`
    const { error: highError } = await admin.client.rpc('create_coupon', {
      p_code: codeHigh,
      p_discount_percent: 100,
    })
    expect(highError).toBeNull()
  })

  it('codeが重複するとわかりやすいエラーメッセージで拒否される', async () => {
    const code = `CONSTRAINT-TEST-DUP-${crypto.randomUUID().slice(0, 8)}`
    const { error: firstError } = await admin.client.rpc('create_coupon', {
      p_code: code,
      p_discount_percent: 10,
    })
    expect(firstError).toBeNull()

    const { data, error } = await admin.client.rpc('create_coupon', {
      p_code: code,
      p_discount_percent: 20,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('既に存在します')
    expect(data).toBeNull()

    const { data: rows } = await createAdminClient().from('coupons').select('id').eq('code', code)
    expect(rows?.length).toBe(1)
  })

  it('usage_limit=0は拒否される', async () => {
    const { data, error } = await admin.client.rpc('create_coupon', {
      p_code: `CONSTRAINT-TEST-LIMIT-${crypto.randomUUID().slice(0, 8)}`,
      p_discount_percent: 10,
      p_usage_limit: 0,
    })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})
