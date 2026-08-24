'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 商品管理Server Actionsの認可方針。
// 書き込み認可自体はRLS「products_write_admin_only」（supabase/migrations/0002_rls.sql）が
// is_admin()で担っており、ここでのバリデーションはUX向上のための入力チェックに過ぎない
// （防御の多層化。app/admin/orders/actions.tsのパターンを踏襲）。

// 価格・在庫は「0以上の整数」であることをここで担保する。
// DB側のcheck制約（price_cents >= 0, stock >= 0）はあるが、不正な値をそのまま渡すと
// エラーメッセージがDB由来のわかりにくいものになるため、事前に弾く。
function parseNonNegativeInt(value: FormDataEntryValue | null, fieldName: string): number {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') {
    throw new Error(`${fieldName}を入力してください`)
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName}は0以上の整数で入力してください`)
  }
  return parsed
}

// member_price_centsは任意項目。未入力ならnull（会員価格なし＝通常価格のみ）として扱う。
function parseOptionalNonNegativeInt(
  value: FormDataEntryValue | null,
  fieldName: string,
): number | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') {
    return null
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName}は0以上の整数で入力してください（空欄可）`)
  }
  return parsed
}

function parseRequiredText(value: FormDataEntryValue | null, fieldName: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') {
    throw new Error(`${fieldName}を入力してください`)
  }
  return raw
}

function parseOptionalText(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw === '' ? null : raw
}

type ProductInput = {
  name: string
  category: string
  price_cents: number
  stock: number
  image_url: string | null
  premium_only: boolean
  member_price_cents: number | null
}

function parseProductFormData(formData: FormData): ProductInput {
  const input: ProductInput = {
    name: parseRequiredText(formData.get('name'), '商品名'),
    category: parseRequiredText(formData.get('category'), 'カテゴリ'),
    price_cents: parseNonNegativeInt(formData.get('price_cents'), '価格'),
    stock: parseNonNegativeInt(formData.get('stock'), '在庫数'),
    image_url: parseOptionalText(formData.get('image_url')),
    // checkboxは未チェック時にformDataへキー自体が含まれないため、存在有無で判定する
    premium_only: formData.get('premium_only') !== null,
    member_price_cents: parseOptionalNonNegativeInt(
      formData.get('member_price_cents'),
      '会員価格',
    ),
  }
  // DBのcheck制約（0019: member_price_cents < price_cents）に先回りして弾き、
  // DB由来のわかりにくいエラーメッセージを利用者に見せないようにする。
  if (input.member_price_cents !== null && input.member_price_cents >= input.price_cents) {
    throw new Error('会員価格は通常価格より安い金額で入力してください')
  }
  return input
}

// 新規商品登録アクション。
export async function createProduct(formData: FormData) {
  const input = parseProductFormData(formData)

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('products').insert(input)
  if (error) {
    throw new Error(`商品の登録に失敗しました（権限がない可能性があります）: ${error.message}`)
  }

  revalidatePath('/admin/products')
  revalidatePath('/')
}

// 既存商品の編集アクション（在庫数を含む全項目を更新する）。
export async function updateProduct(formData: FormData) {
  const productId = formData.get('productId') as string
  if (!productId) {
    throw new Error('商品IDが指定されていません')
  }
  const input = parseProductFormData(formData)

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('products').update(input).eq('id', productId)
  if (error) {
    throw new Error(`商品の更新に失敗しました（権限がない可能性があります）: ${error.message}`)
  }

  revalidatePath('/admin/products')
  revalidatePath('/')
}
