import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'

describe('profiles RLS', () => {
  let userA: TestUser
  let userB: TestUser
  let admin: TestUser

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')
    admin = await createTestUser('admin')

    await userA.client.from('profiles').insert({ id: userA.id, display_name: 'User A' })
  })

  afterAll(async () => {
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
    await deleteTestUser(admin.id)
  })

  it('customer: 自分のprofileをSELECT/UPDATEできる', async () => {
    const { error: updateError } = await userA.client
      .from('profiles')
      .update({ display_name: 'User A Updated' })
      .eq('id', userA.id)
    expect(updateError).toBeNull()

    const { data, error } = await userA.client
      .from('profiles')
      .select('display_name')
      .eq('id', userA.id)
      .single()
    expect(error).toBeNull()
    expect(data?.display_name).toBe('User A Updated')
  })

  it('customer: userBはuserAのprofileをUPDATEできない', async () => {
    await userB.client.from('profiles').update({ display_name: 'hijacked' }).eq('id', userA.id)
    const { data } = await admin.client.from('profiles').select('display_name').eq('id', userA.id).single()
    expect(data?.display_name).not.toBe('hijacked')
  })

  it('admin: 他人のprofileをSELECTできる', async () => {
    const { data, error } = await admin.client.from('profiles').select('id').eq('id', userA.id)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })
})
