'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const VALID_STATUSES = ['received', 'preparing', 'shipped', 'cancelled']

// 注文ステータス更新アクション。認可自体はRLS（is_admin()ゲート）に委ねており、
// ここでのバリデーションはUX向上のための入力チェックに過ぎない（防御の多層化）。
export async function updateOrderStatus(formData: FormData) {
  const orderId = formData.get('orderId') as string
  const status = formData.get('status') as string
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`不正なステータスです: ${status}`)
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
  if (error) {
    throw new Error(`ステータス更新に失敗しました（権限がない可能性があります）: ${error.message}`)
  }
  revalidatePath('/admin/orders')
}
