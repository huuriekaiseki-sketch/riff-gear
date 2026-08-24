'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 再入荷通知の購読登録アクション。restock_subscriptions への insert のみ行う。
// (user_id, product_id) の unique 制約により二重登録は防がれる。
// 認可自体はRLS（本人のみ書き込み可）に委ねており、ここでのチェックは
// UX向上のための入力検証に過ぎない（防御の多層化）。未ログイン時は
// RLSにより挿入自体が失敗するため、事前にログイン確認する。
export async function subscribeRestock(formData: FormData) {
  const productId = formData.get('productId')
  if (typeof productId !== 'string' || productId.length === 0) {
    throw new Error('商品IDが不正です')
  }

  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('ログインが必要です')

  const { error } = await supabase
    .from('restock_subscriptions')
    .insert({ user_id: userData.user.id, product_id: productId })
  // unique制約違反（既に登録済み）はUX上エラーにしない。トグルUIから
  // 二重送信された場合などにここへ来うるため、重複エラー(23505)は無視する。
  if (error && error.code !== '23505') {
    throw new Error(`再入荷通知の登録に失敗しました: ${error.message}`)
  }

  revalidatePath('/')
  revalidatePath('/favorites')
  revalidatePath(`/products/${productId}`)
}

// 再入荷通知の購読解除アクション。restock_subscriptions から本人分を delete する。
export async function unsubscribeRestock(formData: FormData) {
  const productId = formData.get('productId')
  if (typeof productId !== 'string' || productId.length === 0) {
    throw new Error('商品IDが不正です')
  }

  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('ログインが必要です')

  const { error } = await supabase
    .from('restock_subscriptions')
    .delete()
    .eq('user_id', userData.user.id)
    .eq('product_id', productId)
  if (error) {
    throw new Error(`再入荷通知の解除に失敗しました: ${error.message}`)
  }

  revalidatePath('/')
  revalidatePath('/favorites')
  revalidatePath(`/products/${productId}`)
}

// 未読の再入荷通知をまとめて既読化するアクション。
// Server Componentのrender中に書き込みを行うのは避けたいため、
// 通知ページの「すべて既読にする」ボタン(form action)から呼び出す想定。
export async function markRestockNotificationsRead() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('ログインが必要です')

  const { error } = await supabase
    .from('restock_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userData.user.id)
    .is('read_at', null)
  if (error) {
    throw new Error(`既読化に失敗しました: ${error.message}`)
  }

  revalidatePath('/notifications')
}
