import { createServerSupabaseClient } from '@/lib/supabase/server'

// 注文ステータスの表示用日本語ラベル
const STATUS_LABEL: Record<string, string> = {
  received: '注文受付',
  preparing: '発送準備',
  shipped: '発送済み',
  cancelled: 'キャンセル',
}

// 注文詳細ページ。注文本体と明細（商品名・数量・注文時単価）を取得して表示する。
// RLSにより本人の注文以外は取得できないため、見つからない場合はエラーメッセージを出す。
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, total_cents, created_at')
    .eq('id', id)
    .single()

  if (error || !order) {
    return <p role="alert">注文が見つかりません。</p>
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('quantity, price_cents_at_order, products(name)')
    .eq('order_id', id)

  return (
    <main>
      <h1>注文詳細</h1>
      <p>ステータス: {STATUS_LABEL[order.status]}</p>
      <ul>
        {items?.map((item: any, i: number) => (
          <li key={i}>
            {item.products.name} × {item.quantity}（¥{item.price_cents_at_order.toLocaleString()}）
          </li>
        ))}
      </ul>
      <p>合計: ¥{order.total_cents.toLocaleString()}</p>
    </main>
  )
}
