import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// サービスロールキーを使う管理者クライアント。RLSをバイパスするため
// サーバー/テストコード専用とし、アプリのUIコードからは絶対に import しないこと。
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です')
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
