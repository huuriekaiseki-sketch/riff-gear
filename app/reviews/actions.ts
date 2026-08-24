'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { parseRating } from '@/lib/reviews'

// レビューを投稿する。1ユーザー1商品につき1件の制約(unique)があるため、
// 既に投稿済みなら中身を上書き(UPDATE)し、初めてなら新規作成(INSERT)する。
// 「購入したユーザーだけが投稿できる」制約はDB側のRLS(reviews_insert_purchasers_only)
// が担うため、ここでは事前チェックせずDBのエラーメッセージをそのまま利用者に返す。
export async function submitReview(formData: FormData) {
  const productId = formData.get('productId') as string
  const rating = parseRating(formData.get('rating'))
  const comment = (formData.get('comment') as string | null)?.trim() || null

  if (!rating) {
    redirect(`/products/${productId}?reviewError=` + encodeURIComponent('評価は1〜5の間で選択してください'))
  }

  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('ログインが必要です')

  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('product_id', productId)
    .maybeSingle()

  const { error } = existing
    ? await supabase.from('reviews').update({ rating, comment }).eq('id', existing.id)
    : await supabase.from('reviews').insert({ user_id: userData.user.id, product_id: productId, rating, comment })

  if (error) {
    redirect(
      `/products/${productId}?reviewError=` +
        encodeURIComponent('レビューを投稿できませんでした。購入した商品のみレビューできます')
    )
  }

  revalidatePath(`/products/${productId}`)
}

// 自分のレビューを削除する。RLS(reviews_delete_own)により自分のレビューしか消せない。
export async function deleteReview(formData: FormData) {
  const reviewId = formData.get('reviewId') as string
  const productId = formData.get('productId') as string
  const supabase = await createServerSupabaseClient()
  await supabase.from('reviews').delete().eq('id', reviewId)
  revalidatePath(`/products/${productId}`)
}

// レビューへの「参考になった」投票をトグルする。既に自分の投票があれば取り消し(delete)、
// 無ければ新規投票(insert)する。購入者限定にはせずログイン済みなら誰でも投票可能で、
// 1ユーザー1レビュー1票の制約はDB側のunique(user_id, review_id)とRLSに委ねる。
export async function toggleHelpfulVote(formData: FormData) {
  const reviewId = formData.get('reviewId') as string
  const productId = formData.get('productId') as string

  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('ログインが必要です')

  const { data: existing } = await supabase
    .from('review_helpful_votes')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('review_id', reviewId)
    .maybeSingle()

  if (existing) {
    await supabase.from('review_helpful_votes').delete().eq('id', existing.id)
  } else {
    await supabase.from('review_helpful_votes').insert({ user_id: userData.user.id, review_id: reviewId })
  }

  revalidatePath(`/products/${productId}`)
}
