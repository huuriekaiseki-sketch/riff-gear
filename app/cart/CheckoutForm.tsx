'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

const PAYMENT_OPTIONS = [
  { value: 'card', label: 'クレジットカード' },
  { value: 'qr_code', label: 'QRコード決済' },
  { value: 'bank_transfer', label: '銀行振込' },
  { value: 'cod', label: '代金引換' },
  { value: 'convenience_store', label: 'コンビニ支払い' },
] as const

// 通常のPOSTフォーム送信そのままだが、送信直後に「処理中...」表示へ切り替える。
// サーバー側(checkout route)がカード/QRコード決済時に処理をシミュレートするため、
// 押した直後にフィードバックがあった方がわかりやすい。
export default function CheckoutForm({
  disabled,
  totalCents,
}: {
  disabled: boolean
  totalCents: number
}) {
  const [submitting, setSubmitting] = useState(false)
  const [discountPercent, setDiscountPercent] = useState<number | null>(null)
  const [checkingCoupon, setCheckingCoupon] = useState(false)
  // ページ読み込み時に1回だけ生成し、フォーム内に保持する。二重クリックや
  // 戻る+再送信で同じキーのまま2回POSTされても、place_order側で1回分の
  // 注文として扱われる(冪等キー)。
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  // クーポンコード入力欄からフォーカスが外れたタイミングで、DBに直接問い合わせて
  // 割引率をプレビュー表示する。注文確定時の正式な検証はplace_order側で別途行うため、
  // ここでの結果はあくまで「お得感」を見せるための参考表示。
  async function handleCouponBlur(code: string) {
    const trimmed = code.trim()
    if (!trimmed) {
      setDiscountPercent(null)
      return
    }
    setCheckingCoupon(true)
    const supabase = createBrowserSupabaseClient()
    const { data } = await supabase
      .from('coupons')
      .select('discount_percent, active, expires_at')
      .eq('code', trimmed)
      .maybeSingle()
    setCheckingCoupon(false)

    const isValid =
      data?.active && (!data.expires_at || new Date(data.expires_at) > new Date())
    setDiscountPercent(isValid ? data.discount_percent : null)
  }

  const discountedTotal =
    discountPercent != null ? Math.round(totalCents * (1 - discountPercent / 100)) : null

  return (
    <form
      action="/cart/checkout"
      method="post"
      className="mt-4"
      onSubmit={() => setSubmitting(true)}
    >
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <fieldset className={submitting ? 'pointer-events-none opacity-50' : undefined}>
        <legend className="text-sm font-medium text-foreground">支払い方法</legend>
        <div className="mt-2 flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
          {PAYMENT_OPTIONS.map((option, i) => (
            <label key={option.value} className="flex items-center gap-2">
              <input type="radio" name="payment_method" value={option.value} defaultChecked={i === 0} />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={submitting ? 'pointer-events-none mt-4 opacity-50' : 'mt-4'}>
        <label htmlFor="coupon_code" className="text-sm font-medium text-foreground">
          クーポンコード（任意）
        </label>
        <input
          type="text"
          id="coupon_code"
          name="coupon_code"
          placeholder="クーポンコードをお持ちの方はご入力ください"
          onChange={(e) => {
            if (e.target.value.trim() === '') setDiscountPercent(null)
          }}
          onBlur={(e) => handleCouponBlur(e.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-gray-400 focus:border-primary focus:outline-none dark:border-gray-700"
        />
        {checkingCoupon && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">確認中...</p>
        )}
        {discountedTotal != null && (
          <p className="mt-2 text-sm">
            <span className="text-gray-400 line-through dark:text-gray-500">
              ¥{totalCents.toLocaleString()}
            </span>
            <span className="ml-2 font-semibold text-success">
              ¥{discountedTotal.toLocaleString()}
            </span>
            <span className="ml-2 text-success">
              （¥{(totalCents - discountedTotal).toLocaleString()}お得！）
            </span>
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={disabled || submitting}
        className="mt-4 w-full rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? '処理中...' : '注文する'}
      </button>
    </form>
  )
}
