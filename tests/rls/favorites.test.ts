import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

describe('favorites RLS', () => {
  let userA: TestUser
  let userB: TestUser
  let admin: TestUser
  let productId: string
  let productId2: string
  let favoriteAId: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')
    admin = await createTestUser('admin')

    const adminClient = createAdminClient()
    const { data: products } = await adminClient.from('products').select('id').limit(2)
    productId = products![0].id
    productId2 = products![1].id

    const { data, error } = await userA.client
      .from('favorites')
      .insert({ user_id: userA.id, product_id: productId })
      .select('id')
      .single()
    expect(error).toBeNull()
    favoriteAId = data!.id
  })

  afterAll(async () => {
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
    await deleteTestUser(admin.id)
  })

  it('customer: 自分のfavoriteをSELECTできる', async () => {
    const { data, error } = await userA.client.from('favorites').select('id').eq('id', favoriteAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it('customer: userBはuserAのfavoriteをSELECTできない', async () => {
    const { data, error } = await userB.client.from('favorites').select('id').eq('id', favoriteAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(0)
  })

  it('customer: userBはuserAとしてfavoriteをINSERTできない(user_id偽装拒否)', async () => {
    const { error } = await userB.client
      .from('favorites')
      .insert({ user_id: userA.id, product_id: productId2 })
    expect(error).not.toBeNull()
  })

  it('customer: 同じ商品を二重登録するとunique制約でエラーになる', async () => {
    const { error } = await userA.client
      .from('favorites')
      .insert({ user_id: userA.id, product_id: productId })
    expect(error).not.toBeNull()
  })

  it('customer: userBはuserAのfavoriteをDELETEできない', async () => {
    await userB.client.from('favorites').delete().eq('id', favoriteAId)
    const { data } = await admin.client.from('favorites').select('id').eq('id', favoriteAId)
    expect(data?.length).toBe(1)
  })

  it('admin: 他人のfavoriteをSELECT可', async () => {
    const { data, error } = await admin.client.from('favorites').select('id').eq('id', favoriteAId)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it('customer: 自分のfavoriteをDELETEできる', async () => {
    const { error } = await userA.client.from('favorites').delete().eq('id', favoriteAId)
    expect(error).toBeNull()
    const { data } = await admin.client.from('favorites').select('id').eq('id', favoriteAId)
    expect(data?.length).toBe(0)
  })
})
