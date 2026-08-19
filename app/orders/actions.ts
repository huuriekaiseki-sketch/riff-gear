'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getOrCreateCartId } from '../cart/actions'

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

type ReorderItemRow = { product_id: string; quantity: number; products: { stock: number } | null }

// ワンクリック再購入。過去の注文明細を現在のカートへ追加する。
// 在庫が足りない商品は「追加できる分だけ」追加し、追加できなかった件数を
// メッセージで報告する(1件でも在庫不足なら全体を失敗にはしない)。
export async function reorderOrder(formData: FormData) {
  const orderId = formData.get('orderId') as string
  const supabase = await createServerSupabaseClient()

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    redirect('/login')
  }

  const { data: items } = (await supabase
    .from('order_items')
    .select('product_id, quantity, products(stock)')
    .eq('order_id', orderId)) as { data: ReorderItemRow[] | null }

  if (!items || items.length === 0) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent('再購入できる商品がありません')}`)
  }

  const cartId = await getOrCreateCartId(supabase)

  let addedCount = 0
  let skippedCount = 0

  for (const item of items) {
    const stock = item.products?.stock ?? 0
    const { data: existingItem } = await supabase
      .from('cart_items')
      .select('quantity')
      .eq('cart_id', cartId)
      .eq('product_id', item.product_id)
      .maybeSingle()
    const quantityInCart = existingItem?.quantity ?? 0
    const availableToAdd = stock - quantityInCart

    if (availableToAdd <= 0) {
      skippedCount++
      continue
    }

    const { error } = await supabase.rpc('add_cart_item', {
      p_cart_id: cartId,
      p_product_id: item.product_id,
      p_quantity: Math.min(item.quantity, availableToAdd),
    })
    if (error) {
      skippedCount++
      continue
    }
    addedCount++
  }

  revalidatePath('/')
  revalidatePath('/cart')

  const message =
    skippedCount > 0
      ? `${addedCount}件をカートに追加しました。${skippedCount}件は在庫不足のため追加できませんでした`
      : `${addedCount}件をカートに追加しました`
  redirect(`/cart?message=${encodeURIComponent(message)}`)
}
