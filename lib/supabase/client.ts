import { createBrowserClient } from '@supabase/ssr'

// ブラウザ（Client Component）から使う Supabase クライアント。
// anonキー + RLSで動作するため、UIコードから安全に呼び出せる。
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
