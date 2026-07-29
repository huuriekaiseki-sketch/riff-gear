'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ユーザーのカートを取得し、なければ作成してカートIDを返す。
// carts.user_id は unique 制約があるため、1ユーザー1カートを前提にできる。
async function getOrCreateCartId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('ログインが必要です')

  const { data: existing } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('carts')
    .insert({ user_id: userData.user.id })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return created.id
}

// 商品をカートに追加する。既にカートにある商品なら数量を+1、なければ新規追加する。
export async function addToCart(formData: FormData) {
  const productId = formData.get('productId') as string
  const supabase = await createServerSupabaseClient()
  const cartId = await getOrCreateCartId(supabase)

  const { data: existingItem } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .eq('cart_id', cartId)
    .eq('product_id', productId)
    .maybeSingle()

  if (existingItem) {
    await supabase
      .from('cart_items')
      .update({ quantity: existingItem.quantity + 1 })
      .eq('id', existingItem.id)
  } else {
    await supabase.from('cart_items').insert({ cart_id: cartId, product_id: productId, quantity: 1 })
  }

  revalidatePath('/')
  revalidatePath('/cart')
}

// カートから商品を削除する。RLSにより自分のカートの明細しか削除できない。
export async function removeFromCart(formData: FormData) {
  const itemId = formData.get('itemId') as string
  const supabase = await createServerSupabaseClient()
  await supabase.from('cart_items').delete().eq('id', itemId)
  revalidatePath('/cart')
}
