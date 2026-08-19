'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ユーザーのカートを取得し、なければ作成してカートIDを返す。
// carts.user_id は unique 制約があるため、1ユーザー1カートを前提にできる。
export async function getOrCreateCartId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
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
// DB側の add_cart_item 関数（INSERT ... ON CONFLICT ... DO UPDATE）を呼ぶだけにすることで、
// 従来の SELECT→UPDATE/INSERT という read-then-write 方式で起こり得た
// 連続追加時の数量取りこぼしを、DBのアトミックな処理に任せて解消する。
//
// 「このユーザーのカート内数量」が在庫を超えないよう、追加前にチェックする。
// これは自分のカートに対する上限であり、他ユーザーが同時に同じ商品を
// カートに入れている分までは考慮しない（在庫の最終的な排他制御は
// place_order の FOR UPDATE ロックが担う）。
export async function addToCart(formData: FormData) {
  const productId = formData.get('productId') as string
  const supabase = await createServerSupabaseClient()
  const cartId = await getOrCreateCartId(supabase)

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('stock')
    .eq('id', productId)
    .single()
  if (productError) throw new Error(productError.message)

  const { data: existingItem } = await supabase
    .from('cart_items')
    .select('quantity')
    .eq('cart_id', cartId)
    .eq('product_id', productId)
    .maybeSingle()
  const quantityInCart = existingItem?.quantity ?? 0

  if (quantityInCart + 1 > product.stock) {
    redirect('/?error=' + encodeURIComponent('在庫上限に達しているため、これ以上カートに追加できません'))
  }

  const { error } = await supabase.rpc('add_cart_item', {
    p_cart_id: cartId,
    p_product_id: productId,
    p_quantity: 1,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/')
  revalidatePath('/cart')
  // 商品詳細ページからの追加でも残数表示が最新になるよう、詳細ページも再検証する
  revalidatePath(`/products/${productId}`)
}

// カートから商品を削除する。RLSにより自分のカートの明細しか削除できない。
export async function removeFromCart(formData: FormData) {
  const itemId = formData.get('itemId') as string
  const supabase = await createServerSupabaseClient()
  await supabase.from('cart_items').delete().eq('id', itemId)
  revalidatePath('/cart')
}

// カート内の商品数量を+1/-1する。0以下になる場合は明細を削除する。
// RLSにより自分のカートの明細しか更新できないため、cart_id所有者チェックは不要。
export async function updateCartItemQuantity(formData: FormData) {
  const itemId = formData.get('itemId') as string
  const delta = Number(formData.get('delta'))
  const supabase = await createServerSupabaseClient()

  const { data: item, error: itemError } = await supabase
    .from('cart_items')
    .select('quantity, product_id, products(stock)')
    .eq('id', itemId)
    .single<{ quantity: number; product_id: string; products: { stock: number } }>()
  if (itemError) throw new Error(itemError.message)

  const nextQuantity = item.quantity + delta

  if (nextQuantity <= 0) {
    await supabase.from('cart_items').delete().eq('id', itemId)
    revalidatePath('/cart')
    return
  }

  if (nextQuantity > item.products.stock) {
    redirect('/cart?error=' + encodeURIComponent('在庫上限に達しているため、これ以上増やせません'))
  }

  const { error } = await supabase
    .from('cart_items')
    .update({ quantity: nextQuantity })
    .eq('id', itemId)
  if (error) throw new Error(error.message)

  revalidatePath('/cart')
}
