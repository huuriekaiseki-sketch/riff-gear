'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getOrCreateCartId } from '../cart/actions'

type ReorderItemRow = {
  product_id: string
  quantity: number
  // products.premium_only(会員限定商品)のRLSにより、注文時点では見えていた商品でも
  // 購入後に会員ランクが変わった場合は埋め込みselectがnullを返し得るため、
  // nullを許容する型にしておく。
  products: { name: string; stock: number } | null
}

// 注文と同じ商品・数量をカートに再投入する。在庫（カート内の既存数量を含む）が
// 足りない商品は買える分だけ追加し、追加しきれなかった商品名はエラーメッセージで通知する。
// RLSにより自分の注文以外の明細は取得できない。
export async function reorderOrder(formData: FormData) {
  const orderId = formData.get('orderId') as string
  const supabase = await createServerSupabaseClient()

  const { data: items, error: itemsError } = (await supabase
    .from('order_items')
    .select('product_id, quantity, products(name, stock)')
    .eq('order_id', orderId)) as { data: ReorderItemRow[] | null; error: { message: string } | null }
  if (itemsError) throw new Error(itemsError.message)

  const cartId = await getOrCreateCartId(supabase)

  const { data: cartItems } = await supabase
    .from('cart_items')
    .select('product_id, quantity')
    .eq('cart_id', cartId)
  const quantityInCart = new Map((cartItems ?? []).map((c) => [c.product_id, c.quantity]))

  const unavailable: string[] = []

  for (const item of items ?? []) {
    // 会員限定商品を非会員が再注文しようとした場合など、RLSでproductsが取得できず
    // nullになるケースがある。その場合は購入不可として扱う。
    if (!item.products) {
      unavailable.push(`商品ID:${item.product_id}（現在ご利用の会員ランクでは購入できません）`)
      continue
    }
    const current = quantityInCart.get(item.product_id) ?? 0
    const addable = Math.min(item.quantity, item.products.stock - current)
    if (addable <= 0) {
      unavailable.push(item.products.name)
      continue
    }
    const { error } = await supabase.rpc('add_cart_item', {
      p_cart_id: cartId,
      p_product_id: item.product_id,
      p_quantity: addable,
    })
    if (error) throw new Error(error.message)
    quantityInCart.set(item.product_id, current + addable)
    if (addable < item.quantity) {
      unavailable.push(item.products.name)
    }
  }

  revalidatePath('/cart')
  revalidatePath('/')

  if (unavailable.length > 0) {
    redirect(
      '/cart?error=' +
        encodeURIComponent(`在庫不足のため一部の商品は買える分だけ追加しました: ${unavailable.join('、')}`)
    )
  }
  redirect('/cart')
}

// 注文キャンセルアクション。認可・状態チェック(receivedのみ、本人の注文のみ)は
// cancel_order() RPC側(security definer)で行っており、ここでは呼び出すだけ。
export async function cancelOrder(formData: FormData) {
  const orderId = formData.get('orderId') as string

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId })

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')

  if (error) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/orders/${orderId}`)
}
