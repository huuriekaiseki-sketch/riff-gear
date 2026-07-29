import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'

describe('carts RLS', () => {
  let userA: TestUser
  let userB: TestUser
  let admin: TestUser
  let cartAId: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')
    admin = await createTestUser('admin')

    const { data, error } = await userA.client
      .from('carts')
      .insert({ user_id: userA.id })
      .select('id')
      .single()
    expect(error).toBeNull()
    cartAId = data!.id
  })

  afterAll(async () => {
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
    await deleteTestUser(admin.id)
  })

  it('customer: 自分のcartをSELECT/INSERTできる', async () => {
    const { data, error } = await userA.client.from('carts').select('id').eq('id', cartAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it('customer: userBがuserAのcartをSELECTしても空になる', async () => {
    const { data, error } = await userB.client.from('carts').select('id').eq('id', cartAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(0)
  })

  it('customer: userBがuserAのcartをUPDATEしても効果がない', async () => {
    await userB.client.from('carts').update({ user_id: userB.id }).eq('id', cartAId)
    const { data } = await admin.client.from('carts').select('user_id').eq('id', cartAId).single()
    expect(data?.user_id).toBe(userA.id)
  })

  it('admin: 他人のcartをSELECT可', async () => {
    const { data, error } = await admin.client.from('carts').select('id').eq('id', cartAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })
})
