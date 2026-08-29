'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// クーポン管理Server Actionsの認可方針。
// 書き込み認可自体はRLS「coupons_write_admin_only」（supabase/migrations/0017_coupons.sql）に加え、
// RPC関数create_coupon/deactivate_coupon内でもis_admin()チェックを行う二重防御構成
// （app/admin/products/actions.tsと同様、ここでのバリデーションはUX向上のための入力チェックに過ぎない）。

function parseRequiredText(value: FormDataEntryValue | null, fieldName: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') {
    throw new Error(`${fieldName}を入力してください`)
  }
  return raw
}

// 割引率は1〜100の整数であることをここで担保する。
// DB側のcheck制約（discount_percent > 0 and <= 100）はあるが、不正な値をそのまま渡すと
// エラーメッセージがDB由来のわかりにくいものになるため、事前に弾く。
function parseDiscountPercent(value: FormDataEntryValue | null): number {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') {
    throw new Error('割引率を入力してください')
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('割引率は1〜100の整数で入力してください')
  }
  return parsed
}

// 利用回数上限は任意項目。未入力ならnull（無制限）として扱う。
function parseOptionalPositiveInt(
  value: FormDataEntryValue | null,
  fieldName: string,
): number | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') {
    return null
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${fieldName}は1以上の整数で入力してください（空欄可）`)
  }
  return parsed
}

// datetime-local(<input type="datetime-local">)の値をtimestamptzに渡せる形へ変換する。
// 未入力ならnull（無期限）として扱う。
function parseOptionalDateTime(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') {
    return null
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('有効期限の形式が不正です')
  }
  return parsed.toISOString()
}

// 新規クーポン登録アクション。
// 想定RPC: create_coupon(p_code text, p_discount_percent integer, p_expires_at timestamptz default null, p_usage_limit integer default null) returns uuid
export async function createCoupon(formData: FormData) {
  const code = parseRequiredText(formData.get('code'), 'クーポンコード')
  const discountPercent = parseDiscountPercent(formData.get('discount_percent'))
  const expiresAt = parseOptionalDateTime(formData.get('expires_at'))
  const usageLimit = parseOptionalPositiveInt(formData.get('usage_limit'), '利用回数上限')

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('create_coupon', {
    p_code: code,
    p_discount_percent: discountPercent,
    p_expires_at: expiresAt,
    p_usage_limit: usageLimit,
  })
  if (error) {
    throw new Error(`クーポンの登録に失敗しました（権限がない可能性があります）: ${error.message}`)
  }

  revalidatePath('/admin/coupons')
}

// クーポン無効化アクション（冪等。既に無効なクーポンに対して呼んでもエラーにならない）。
// 想定RPC: deactivate_coupon(p_coupon_id uuid) returns void
export async function deactivateCoupon(formData: FormData) {
  const couponId = formData.get('couponId')
  if (typeof couponId !== 'string' || couponId === '') {
    throw new Error('クーポンIDが指定されていません')
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('deactivate_coupon', {
    p_coupon_id: couponId,
  })
  if (error) {
    throw new Error(`クーポンの無効化に失敗しました（権限がない可能性があります）: ${error.message}`)
  }

  revalidatePath('/admin/coupons')
}
