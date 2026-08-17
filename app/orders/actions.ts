'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
