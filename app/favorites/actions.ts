'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// お気に入りのオン/オフを切り替える。favoritesテーブルの (user_id, product_id)
// unique制約により、同じ商品を二重登録することはない。
// 未ログイン時はRLSにより挿入自体が失敗するため、事前にログイン確認する。
export async function toggleFavorite(formData: FormData) {
  const productId = formData.get('productId') as string
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('ログインが必要です')

  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('product_id', productId)
    .maybeSingle()

  if (existing) {
    await supabase.from('favorites').delete().eq('id', existing.id)
  } else {
    await supabase.from('favorites').insert({ user_id: userData.user.id, product_id: productId })
  }

  revalidatePath('/')
  revalidatePath('/favorites')
  revalidatePath(`/products/${productId}`)
}
