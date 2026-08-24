import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

// review_helpful_votes(0024)のRLS回帰テスト。
// 認可境界の仕様(このテストが正):
// - select: 誰でも可(投票数は未ログインにも社会的証明として見せる)
// - insert: 本人名義(user_id = auth.uid())のみ。ログイン済みなら購入者でなくても可
// - delete: 本人またはadminのみ
// - 二重投票はunique(user_id, review_id)で拒否(トグルの取り消しはdeleteで行う)
describe('review_helpful_votes RLS', () => {
  let userA: TestUser
  let userB: TestUser
  let productId: string
  let reviewId: string

  beforeAll(async () => {
    userA = await createTestUser('customer')
    userB = await createTestUser('customer')

    // 投票対象のレビューを用意する。レビューのinsertは購入者限定RLSがあるため、
    // 注文まで作ると準備が重い。ここでの検証対象は投票テーブルのRLSなので、
    // レビュー自体はservice role(RLSバイパス)で直接作成する。
    const adminClient = createAdminClient()
    const { data: product } = await adminClient
      .from('products')
      .insert({
        name: 'review-helpful-votes.test.ts専用ダミー商品',
        category: 'accessory',
        price_cents: 1000,
        stock: 5,
      })
      .select('id')
      .single()
    productId = product!.id

    const { data: review, error: reviewError } = await adminClient
      .from('reviews')
      .insert({ user_id: userA.id, product_id: productId, rating: 5, comment: '投票テスト用' })
      .select('id')
      .single()
    if (reviewError || !review) {
      throw new Error(`テストレビューの作成に失敗: ${reviewError?.message}`)
    }
    reviewId = review.id
  })

  afterAll(async () => {
    const adminClient = createAdminClient()
    // review_helpful_votes・reviewsはそれぞれ親(reviews/products)へのon delete cascadeで消える
    await adminClient.from('products').delete().eq('id', productId)
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
  })

  it('anon: 投票のSELECTはできる(票数の公開)', async () => {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await anonClient
      .from('review_helpful_votes')
      .select('review_id')
      .eq('review_id', reviewId)
    expect(error).toBeNull()
  })

  it('anon: INSERTは拒否される', async () => {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await anonClient
      .from('review_helpful_votes')
      .insert({ user_id: userA.id, review_id: reviewId })
    expect(error).not.toBeNull()
  })

  it('customer: 自分名義の投票はINSERTできる(購入者でなくても可)', async () => {
    const { error } = await userA.client
      .from('review_helpful_votes')
      .insert({ user_id: userA.id, review_id: reviewId })
    expect(error).toBeNull()
  })

  it('customer: 同じレビューへの二重投票はunique制約で拒否される', async () => {
    const { error } = await userA.client
      .from('review_helpful_votes')
      .insert({ user_id: userA.id, review_id: reviewId })
    expect(error).not.toBeNull()
  })

  it('customer: 他人名義(userA)の投票をuserBはINSERTできない', async () => {
    const { error } = await userB.client
      .from('review_helpful_votes')
      .insert({ user_id: userA.id, review_id: reviewId })
    expect(error).not.toBeNull()
  })

  it('customer: userBはuserAの投票をDELETEできない(投票が残る)', async () => {
    await userB.client
      .from('review_helpful_votes')
      .delete()
      .eq('user_id', userA.id)
      .eq('review_id', reviewId)

    const { data } = await createAdminClient()
      .from('review_helpful_votes')
      .select('id')
      .eq('user_id', userA.id)
      .eq('review_id', reviewId)
    expect(data?.length).toBe(1)
  })

  it('customer: 自分の投票はDELETEできる(トグルの取り消し)', async () => {
    const { error } = await userA.client
      .from('review_helpful_votes')
      .delete()
      .eq('user_id', userA.id)
      .eq('review_id', reviewId)
    expect(error).toBeNull()

    const { data } = await createAdminClient()
      .from('review_helpful_votes')
      .select('id')
      .eq('user_id', userA.id)
      .eq('review_id', reviewId)
    expect(data?.length).toBe(0)
  })
})
