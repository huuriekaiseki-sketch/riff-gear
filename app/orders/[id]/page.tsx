import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cancelOrder } from '../actions'

type OrderItemRow = {
  quantity: number
  price_cents_at_order: number
  products: { name: string }
}

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

// 注文詳細ページ。注文本体と明細（商品名・数量・注文時単価）を取得して表示する。
// RLSにより本人の注文以外は取得できないため、見つからない場合はエラーメッセージを出す。
export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error: errorMessage } = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, total_cents, created_at')
    .eq('id', id)
    .single()

  if (error || !order) {
    return (
      <p role="alert" className="text-danger">
        注文が見つかりません。
      </p>
    )
  }

  const { data: items } = (await supabase
    .from('order_items')
    .select('quantity, price_cents_at_order, products(name)')
    .eq('order_id', id)) as { data: OrderItemRow[] | null }

  return (
    <main className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">注文詳細</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-500'}`}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>
      {errorMessage && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <ul className="mt-6 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-surface shadow-sm dark:divide-gray-800 dark:border-gray-800">
        {items?.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-4 px-6 py-4">
            <p className="font-medium text-foreground">{item.products.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              × {item.quantity}（¥{item.price_cents_at_order.toLocaleString()}）
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-6 rounded-2xl border border-gray-200 bg-surface p-6 text-right shadow-sm dark:border-gray-800">
        <p className="text-lg font-semibold text-foreground">
          合計: ¥{order.total_cents.toLocaleString()}
        </p>
      </div>
      {order.status === 'received' && (
        <form action={cancelOrder} className="mt-6 text-right">
          <input type="hidden" name="orderId" value={order.id} />
          <button
            type="submit"
            className="rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
          >
            注文をキャンセルする
          </button>
        </form>
      )}
    </main>
  )
}
