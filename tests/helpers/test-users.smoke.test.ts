import { describe, it, expect, afterAll } from 'vitest'
import { createTestUser, deleteTestUser } from './test-users'

describe('createTestUser', () => {
  const created: string[] = []
  afterAll(async () => {
    for (const id of created) await deleteTestUser(id)
  })

  it('creates a signed-in customer client', async () => {
    const user = await createTestUser('customer')
    created.push(user.id)
    const { data, error } = await user.client.auth.getUser()
    expect(error).toBeNull()
    expect(data.user?.id).toBe(user.id)
  })
})
