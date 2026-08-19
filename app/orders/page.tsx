import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  STATUS_LABEL,
  STATUS_COLOR,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from '@/lib/order-labels'
import { reorderOrder } from './actions'

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
    .select('id, status, total_cents, created_at, payment_method, payment_status')
    .order('created_at', { ascending: false })

  if (error) {
    return <p role="alert">注文履歴の取得に失敗しました: {error.message}</p>
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">注文履歴</h1>
      <ul className="mt-6 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-surface shadow-sm dark:divide-gray-800 dark:border-gray-800">
        {orders?.map((order) => (
          <li key={order.id} className="flex items-center justify-between gap-4 px-6 py-4">
            <Link
              href={`/orders/${order.id}`}
              className="flex flex-1 items-center justify-between gap-4 transition-colors hover:opacity-80"
            >
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(order.created_at).toLocaleDateString('ja-JP')}
                </p>
                <p className="font-medium text-foreground">
                  ¥{order.total_cents.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {order.status === 'cancelled' ? (
                    <>{PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method}（キャンセル済みのため支払いステータスは対象外）</>
                  ) : (
                    <>
                      {PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method}
                      {' ・ '}
                      {PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status}
                    </>
                  )}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-500'}`}
              >
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
            </Link>
            <form action={reorderOrder}>
              <input type="hidden" name="orderId" value={order.id} />
              <button
                type="submit"
                className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-primary hover:text-primary dark:border-gray-700 dark:text-gray-300"
              >
                もう一度注文する
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  )
}
