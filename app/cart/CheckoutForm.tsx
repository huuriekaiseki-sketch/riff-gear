'use client'

import { useState } from 'react'

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
export default function CheckoutForm({ disabled }: { disabled: boolean }) {
  const [submitting, setSubmitting] = useState(false)

  return (
    <form
      action="/cart/checkout"
      method="post"
      className="mt-4"
      onSubmit={() => setSubmitting(true)}
    >
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
          className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-gray-400 focus:border-primary focus:outline-none dark:border-gray-700"
        />
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
