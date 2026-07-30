import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type TestUser = { id: string; email: string; client: SupabaseClient }

// RLSテスト用に使い捨てのテストユーザーを作成する。
// service role で確認済みユーザーを作り、app_metadata.role を設定した上で
// 通常のanonクライアントでサインインし、そのユーザーとして振る舞うクライアントを返す。
export async function createTestUser(role: 'customer' | 'admin'): Promise<TestUser> {
  const admin = createAdminClient()
  const email = `rls-test-${role}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
  const password = 'test-password-12345'

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  })
  if (createError || !created.user) {
    throw new Error(`テストユーザー作成に失敗: ${createError?.message}`)
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    throw new Error(`テストユーザーのサインインに失敗: ${signInError.message}`)
  }

  return { id: created.user.id, email, client }
}

// テスト終了後にテストユーザーを削除する後片付け用ヘルパー。
export async function deleteTestUser(id: string): Promise<void> {
  const admin = createAdminClient()
  await admin.auth.admin.deleteUser(id)
}
