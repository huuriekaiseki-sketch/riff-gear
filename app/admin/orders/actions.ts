'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const VALID_STATUSES = ['received', 'preparing', 'shipped', 'cancelled']
const VALID_PAYMENT_STATUSES = ['pending', 'paid']

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

// 支払いステータス手動更新アクション。銀行振込・代金引換・コンビニ支払いは
// 入金/支払い確認を店舗側(管理者)が目視で行う想定のため、手動で切り替えられるようにする。
export async function updatePaymentStatus(formData: FormData) {
  const orderId = formData.get('orderId') as string
  const paymentStatus = formData.get('paymentStatus') as string
  if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new Error(`不正な支払いステータスです: ${paymentStatus}`)
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('orders').update({ payment_status: paymentStatus }).eq('id', orderId)
  if (error) {
    throw new Error(`支払いステータス更新に失敗しました（権限がない可能性があります）: ${error.message}`)
  }
  revalidatePath('/admin/orders')
}
