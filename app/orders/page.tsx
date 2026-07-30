import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 注文ステータスの表示用日本語ラベルとバッジ色
const STATUS_LABEL: Record<string, string> = {
  received: '注文受付',
  preparing: '発送準備',
  shipped: '発送済み',
  cancelled: 'キャンセル',
}
const STATUS_COLOR: Record<string, string> = {
  received: 'bg-secondary/10 text-secondary',
  preparing: 'bg-warning/10 text-warning',
  shipped: 'bg-success/10 text-success',
  cancelled: 'bg-danger/10 text-danger',
}

// 注文履歴ページ。RLSにより`orders`は本人の行しか返らないため、
// クエリ自体に user_id フィルタを書かなくてもユーザー間の分離が保たれる。
export default async function OrderHistoryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return <p className="text-gray-500 dark:text-gray-400">注文履歴を見るにはログインしてください。</p>
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, total_cents, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return <p role="alert">注文履歴の取得に失敗しました: {error.message}</p>
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">注文履歴</h1>
      <ul className="mt-6 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-surface shadow-sm dark:divide-gray-800 dark:border-gray-800">
        {orders?.map((order) => (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(order.created_at).toLocaleDateString('ja-JP')}
                </p>
                <p className="font-medium text-foreground">
                  ¥{order.total_cents.toLocaleString()}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-500'}`}
              >
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
