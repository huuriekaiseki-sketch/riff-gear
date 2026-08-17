import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'

// 商品一覧の検索・カテゴリ絞り込みで使うSupabaseクエリ条件(category/ilike)が
// 期待通りの商品だけを返すかを検証する。他のシードデータと混ざらないよう、
// このテスト専用の商品を作って検証する。
describe('商品検索・カテゴリ絞り込みクエリ', () => {
  const adminClient = createAdminClient()
  let guitarId: string
  let keyboardId: string

  beforeAll(async () => {
    const { data: guitar, error: guitarError } = await adminClient
      .from('products')
      .insert({ name: '検索テスト用ストラトキャスター', category: 'guitar', price_cents: 50000, stock: 1 })
      .select('id')
      .single()
    expect(guitarError).toBeNull()
    guitarId = guitar!.id

    const { data: keyboard, error: keyboardError } = await adminClient
      .from('products')
      .insert({ name: '検索テスト用シンセサイザー', category: 'keyboard', price_cents: 30000, stock: 1 })
      .select('id')
      .single()
    expect(keyboardError).toBeNull()
    keyboardId = keyboard!.id
  })

  afterAll(async () => {
    await adminClient.from('products').delete().in('id', [guitarId, keyboardId])
  })

  it('categoryで絞り込むと該当カテゴリの商品のみ返る', async () => {
    const { data, error } = await adminClient
      .from('products')
      .select('id, category')
      .eq('category', 'guitar')
      .in('id', [guitarId, keyboardId])
    expect(error).toBeNull()
    expect(data?.map((p) => p.id)).toEqual([guitarId])
  })

  it('商品名の部分一致検索で該当商品のみ返る', async () => {
    const { data, error } = await adminClient
      .from('products')
      .select('id, name')
      .ilike('name', '%シンセサイザー%')
      .in('id', [guitarId, keyboardId])
    expect(error).toBeNull()
    expect(data?.map((p) => p.id)).toEqual([keyboardId])
  })

  it('categoryと検索語を組み合わせても正しく絞り込める', async () => {
    const { data, error } = await adminClient
      .from('products')
      .select('id')
      .eq('category', 'guitar')
      .ilike('name', '%検索テスト用%')
      .in('id', [guitarId, keyboardId])
    expect(error).toBeNull()
    expect(data?.map((p) => p.id)).toEqual([guitarId])
  })
})
