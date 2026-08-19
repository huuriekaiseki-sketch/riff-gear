import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateOrderStatus, updatePaymentStatus } from './actions'
import { PAYMENT_STATUS_LABEL } from '@/lib/order-labels'
import { getAbandonmentCutoffISOString } from '@/lib/cartAbandonment'
import { notifyAdminOfAbandonedCarts } from '@/lib/webhook'

const PAYMENT_STATUSES = ['pending', 'paid'] as const
const PAYMENT_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  paid: 'bg-success/10 text-success',
}

const STATUSES = ['received', 'preparing', 'shipped', 'cancelled'] as const
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

type CartItemForAbandonment = {
  quantity: number
  created_at: string
  products: { name: string } | { name: string }[] | null
}
type CartForAbandonment = { id: string; user_id: string; cart_items: CartItemForAbandonment[] }

// 放棄カート(=しきい値時間を超えて未注文のまま残っているカート)を検知し、
// 未通知のものだけ管理者Slackへ通知して通知済みフラグを立てる。
// 常駐cronサーバーを持たないため、管理者が注文一覧ページを開いたタイミングで
// 遅延チェックする（カート内在庫確保のカウントダウン機能と同じ設計）。
async function checkAndNotifyAbandonedCarts(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) {
  const cutoff = getAbandonmentCutoffISOString()
  const { data: carts } = (await supabase
    .from('carts')
    .select('id, user_id, cart_items(quantity, created_at, products(name))')
    .is('abandoned_notified_at', null)) as { data: CartForAbandonment[] | null }

  const abandonedCarts = (carts ?? []).filter((cart) =>
    cart.cart_items.some((item) => item.created_at < cutoff)
  )
  if (abandonedCarts.length === 0) return

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', abandonedCarts.map((cart) => cart.user_id))
  const displayNameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.display_name]))

  await notifyAdminOfAbandonedCarts(
    abandonedCarts.map((cart) => ({
      cartId: cart.id,
      userId: cart.user_id,
      displayName: displayNameByUserId.get(cart.user_id) ?? null,
      items: cart.cart_items.map((item) => {
        const product = Array.isArray(item.products) ? item.products[0] : item.products
        return { productName: product?.name ?? '不明な商品', quantity: item.quantity }
      }),
    }))
  )

  await supabase
    .from('carts')
    .update({ abandoned_notified_at: new Date().toISOString() })
    .in('id', abandonedCarts.map((cart) => cart.id))
}

// 管理者向け全注文管理ページ。
// app_metadata.role のチェックはUI表示上の防御多層化に過ぎず、
// 実際のアクセス制御はDB側のRLS（is_admin()ゲート）が担う。
export default async function AdminOrdersPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  const isAdmin = userData.user?.app_metadata?.role === 'admin'

  if (!isAdmin) {
    return (
      <p role="alert" className="text-danger">
        このページには管理者のみアクセスできます。
      </p>
    )
  }

  await checkAndNotifyAbandonedCarts(supabase)

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, user_id, status, total_cents, created_at, payment_method, payment_status')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <p role="alert" className="text-danger">
        注文一覧の取得に失敗しました: {error.message}
      </p>
    )
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">全注文管理</h1>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-surface shadow-sm dark:border-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-6 py-3 font-medium">注文ID</th>
              <th className="px-6 py-3 font-medium">ユーザー</th>
              <th className="px-6 py-3 font-medium">合計</th>
              <th className="px-6 py-3 font-medium">ステータス</th>
              <th className="px-6 py-3 font-medium">支払い</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {orders?.map((order) => (
              <tr key={order.id}>
                <td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {order.id}
                </td>
                <td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {order.user_id}
                </td>
                <td className="px-6 py-4 font-medium text-foreground">
                  ¥{order.total_cents.toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <form action={updateOrderStatus} className="flex items-center gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <select
                      key={order.status}
                      name="status"
                      defaultValue={order.status}
                      className={`rounded-full border-0 px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-500'}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      更新
                    </button>
                  </form>
                </td>
                <td className="px-6 py-4">
                  <form action={updatePaymentStatus} className="flex items-center gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <select
                      key={order.payment_status}
                      name="paymentStatus"
                      defaultValue={order.payment_status}
                      className={`rounded-full border-0 px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 ${PAYMENT_STATUS_COLOR[order.payment_status] ?? 'bg-gray-100 text-gray-500'}`}
                    >
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PAYMENT_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      更新
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
