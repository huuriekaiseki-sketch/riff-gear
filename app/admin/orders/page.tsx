import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateOrderStatus } from './actions'

const STATUSES = ['received', 'preparing', 'shipped', 'cancelled'] as const
const STATUS_LABEL: Record<string, string> = {
  received: '注文受付',
  preparing: '発送準備',
  shipped: '発送済み',
  cancelled: 'キャンセル',
}

// 管理者向け全注文管理ページ。
// app_metadata.role のチェックはUI表示上の防御多層化に過ぎず、
// 実際のアクセス制御はDB側のRLS（is_admin()ゲート）が担う。
export default async function AdminOrdersPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  const isAdmin = userData.user?.app_metadata?.role === 'admin'

  if (!isAdmin) {
    return <p role="alert">このページには管理者のみアクセスできます。</p>
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, user_id, status, total_cents, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return <p role="alert">注文一覧の取得に失敗しました: {error.message}</p>
  }

  return (
    <main>
      <h1>全注文管理</h1>
      <table>
        <thead>
          <tr>
            <th>注文ID</th>
            <th>ユーザー</th>
            <th>合計</th>
            <th>ステータス</th>
          </tr>
        </thead>
        <tbody>
          {orders?.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.user_id}</td>
              <td>¥{order.total_cents.toLocaleString()}</td>
              <td>
                <form action={updateOrderStatus}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <select name="status" defaultValue={order.status}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <button type="submit">更新</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
