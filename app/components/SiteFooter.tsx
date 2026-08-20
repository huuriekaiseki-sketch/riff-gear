import { createServerSupabaseClient } from '@/lib/supabase/server'

// 全ページ共通のフッター。ログイン中ユーザーの表示名をサイト名の隣に出す。
// display_name未設定の場合は何も出さず、サイト名のみ表示する。
export default async function SiteFooter() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()

  let displayName: string | null = null
  if (userData.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userData.user.id)
      .maybeSingle()
    displayName = profile?.display_name || null
  }

  return (
    <footer className="border-t border-gray-200/80 py-6 text-sm text-gray-500 dark:border-gray-800/80 dark:text-gray-400">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-6">
        <span className="font-semibold text-foreground">Riff Gear</span>
        {displayName && <span>ようこそ、{displayName}さん</span>}
      </div>
    </footer>
  )
}
