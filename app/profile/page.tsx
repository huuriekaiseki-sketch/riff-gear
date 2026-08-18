import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateProfile } from './actions'

// 表示名・お届け先住所を編集するページ。未入力のままでも注文はできるため、必須項目はない。
export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    redirect('/login')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, postal_code, address, phone')
    .eq('id', userData.user.id)
    .single()

  if (error) {
    return (
      <p role="alert" className="text-danger">
        プロフィールの取得に失敗しました: {error.message}
      </p>
    )
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">プロフィール</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        注文確定時の管理者通知に使われます。未入力でも注文は可能です。
      </p>
      <form
        action={updateProfile}
        className="mt-6 max-w-md space-y-4 rounded-2xl border border-gray-200 bg-surface p-8 shadow-sm dark:border-gray-800"
      >
        <label className="block text-sm font-medium text-foreground">
          表示名
          <input
            type="text"
            name="display_name"
            defaultValue={profile?.display_name ?? ''}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700 dark:bg-black"
          />
        </label>
        <label className="block text-sm font-medium text-foreground">
          郵便番号
          <input
            type="text"
            name="postal_code"
            defaultValue={profile?.postal_code ?? ''}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700 dark:bg-black"
          />
        </label>
        <label className="block text-sm font-medium text-foreground">
          住所
          <input
            type="text"
            name="address"
            defaultValue={profile?.address ?? ''}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700 dark:bg-black"
          />
        </label>
        <label className="block text-sm font-medium text-foreground">
          電話番号
          <input
            type="text"
            name="phone"
            defaultValue={profile?.phone ?? ''}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700 dark:bg-black"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          保存
        </button>
      </form>
    </main>
  )
}
