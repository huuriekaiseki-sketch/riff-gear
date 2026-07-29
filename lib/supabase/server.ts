import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server Component / Route Handler / Server Action から使う Supabase クライアント。
// Cookieストアを介してセッションを読み書きする（anonキー + RLSで動作）。
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Server Component から呼ばれた場合、Cookie書き込みが失敗することがあるが
          // ミドルウェア側でセッション更新しているため無視してよい
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
