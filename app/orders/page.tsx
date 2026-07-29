import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 注文ステータスの表示用日本語ラベル
const STATUS_LABEL: Record<string, string> = {
  received: '注文受付',
  preparing: '発送準備',
  shipped: '発送済み',
  cancelled: 'キャンセル',
}

// 注文履歴ページ。RLSにより`orders`は本人の行しか返らないため、
// クエリ自体に user_id フィルタを書かなくてもユーザー間の分離が保たれる。
export default async function OrderHistoryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return <p>注文履歴を見るにはログインしてください。</p>
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, total_cents, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return <p role="alert">注文履歴の取得に失敗しました: {error.message}</p>
  }

  return (
    <main>
      <h1>注文履歴</h1>
      <ul>
        {orders?.map((order) => (
          <li key={order.id}>
            <Link href={`/orders/${order.id}`}>
              {new Date(order.created_at).toLocaleDateString('ja-JP')} — ¥
              {order.total_cents.toLocaleString()} — {STATUS_LABEL[order.status]}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
