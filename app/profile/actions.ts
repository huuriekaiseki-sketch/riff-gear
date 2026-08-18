'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// プロフィール更新アクション。RLS(profiles_update_own)により、
// 本人以外のprofilesを更新することはできない。
export async function updateProfile(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    throw new Error('ログインが必要です')
  }

  const displayName = (formData.get('display_name') as string) || null
  const postalCode = (formData.get('postal_code') as string) || null
  const address = (formData.get('address') as string) || null
  const phone = (formData.get('phone') as string) || null

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName, postal_code: postalCode, address, phone })
    .eq('id', userData.user.id)
  if (error) {
    throw new Error(`プロフィールの更新に失敗しました: ${error.message}`)
  }
  revalidatePath('/profile')
}
