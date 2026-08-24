import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { markRestockNotificationsRead } from '@/lib/restock'

type NotificationRow = {
  id: string
  product_id: string
  product_name: string
  created_at: string
  read_at: string | null
}

// 再入荷通知の一覧ページ。新しい順に表示し、未読は強調表示する。
// 既読化はページ表示時ではなく「すべて既読にする」ボタン押下時に行う
// (Server Componentのrender中にDB書き込みをすると副作用が読み取りに紛れるため)。
export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return <p className="text-gray-500 dark:text-gray-400">お知らせを見るにはログインしてください。</p>
  }

  const { data: notifications } = (await supabase
    .from('restock_notifications')
    .select('id, product_id, product_name, created_at, read_at')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })) as { data: NotificationRow[] | null }

  const hasUnread = (notifications ?? []).some((n) => n.read_at === null)

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">お知らせ</h1>
        {hasUnread && (
          <form action={markRestockNotificationsRead}>
            <button
              type="submit"
              className="rounded-full border border-gray-300 px-4 py-1.5 text-sm text-gray-600 transition-colors hover:border-primary/40 hover:text-primary dark:border-gray-700 dark:text-gray-300"
            >
              すべて既読にする
            </button>
          </form>
        )}
      </div>
      {(notifications ?? []).length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-surface px-6 py-16 text-center shadow-sm dark:border-gray-800">
          <p className="text-gray-500 dark:text-gray-400">お知らせはまだありません。</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications!.map((n) => (
            <li
              key={n.id}
              className={`rounded-2xl border p-4 shadow-sm dark:border-gray-800 ${
                n.read_at === null
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-gray-200 bg-surface'
              }`}
            >
              <Link href={`/products/${n.product_id}`} className="block hover:underline">
                <p className="font-medium text-foreground">
                  {n.read_at === null && (
                    <span className="mr-2 inline-block rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-white">
                      未読
                    </span>
                  )}
                  {n.product_name} が再入荷しました
                </p>
              </Link>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {new Date(n.created_at).toLocaleString('ja-JP')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
