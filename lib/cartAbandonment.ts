import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyAdminOfAbandonedCarts } from '@/lib/webhook'

// カート放棄判定のしきい値。追加からこの時間を過ぎても未注文なら「放棄」とみなす。

export const ABANDONMENT_THRESHOLD_MINUTES = 60

export function getAbandonmentCutoffISOString(now: number = Date.now()): string {
  return new Date(now - ABANDONMENT_THRESHOLD_MINUTES * 60_000).toISOString()
}

type CartItemForAbandonment = {
  quantity: number
  created_at: string
  products: { name: string } | { name: string }[] | null
}
type CartForAbandonment = { id: string; user_id: string; cart_items: CartItemForAbandonment[] }

// 放棄カート(=しきい値時間を超えて未注文のまま残っているカート)を検知し、
// 未通知のものだけ管理者Slackへ通知して通知済みフラグを立てる。
// 呼び出し元は2つ: 管理者が注文一覧ページを開いた時(遅延チェック、session client)と
// Cron経由の定期実行(app/api/cron/abandoned-carts、admin client)。どちらも
// abandoned_notified_at is null で絞り込むため、同時期に両方から呼ばれても二重通知しない。
export async function checkAndNotifyAbandonedCarts(supabase: SupabaseClient) {
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
    .in(
      'id',
      abandonedCarts.map((cart) => cart.user_id)
    )
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
    .in(
      'id',
      abandonedCarts.map((cart) => cart.id)
    )
}
