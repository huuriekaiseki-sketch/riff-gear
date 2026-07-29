import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'

describe('products RLS', () => {
  let customer: TestUser
  let admin: TestUser

  beforeAll(async () => {
    customer = await createTestUser('customer')
    admin = await createTestUser('admin')
  })

  afterAll(async () => {
    await deleteTestUser(customer.id)
    await deleteTestUser(admin.id)
  })

  it('customer: 誰でもSELECT可', async () => {
    const { data, error } = await customer.client.from('products').select('id').limit(1)
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('customer: INSERTは拒否される', async () => {
    const { error } = await customer.client
      .from('products')
      .insert({ name: 'x', category: 'guitar', price_cents: 100, stock: 1 })
    expect(error).not.toBeNull()
  })

  it('admin: INSERT/UPDATE/DELETEが可能', async () => {
    const { data: inserted, error: insertError } = await admin.client
      .from('products')
      .insert({ name: 'RLSテスト商品', category: 'accessory', price_cents: 100, stock: 1 })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    const { error: updateError } = await admin.client
      .from('products')
      .update({ stock: 2 })
      .eq('id', inserted!.id)
    expect(updateError).toBeNull()

    const { error: deleteError } = await admin.client
      .from('products')
      .delete()
      .eq('id', inserted!.id)
    expect(deleteError).toBeNull()
  })
})
