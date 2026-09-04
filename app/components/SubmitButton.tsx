'use client'

import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'

// Server Actionフォーム(<form action={...}>)の送信ボタン。送信中はスピナーを添えて無効化する。
//
// なぜページ側ではなくボタンだけをクライアントコンポーネントにするか:
// useFormStatusは「最も近い親<form>の送信状態」を返すフックで、クライアントコンポーネントでしか
// 使えない。ボタンだけを切り出せば、各ページはServer Componentのまま(データ取得・認可ガードを
// 変えずに)処理中表示を足せる。同じ画面に複数のフォームがあっても、押したボタンの<form>だけが
// pendingになるので「他の行は操作できる」が自然に満たされる。
//
// 見た目は呼び出し側のclassNameをそのまま使い、共通側は「横並び・折り返し禁止・処理中カーソル」
// だけを足す(共通コンポーネントが各ページの色・サイズを強制しない)。
const SPINNER_SIZE = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
} as const

export default function SubmitButton({
  children,
  className,
  disabled = false,
  spinnerSize = 'md',
  iconOnly = false,
  ...rest
}: {
  children: ReactNode
  className?: string
  // 呼び出し側の無効化条件(在庫上限・未入力など)。処理中とORで合成する
  disabled?: boolean
  // text-xsのボタンでは'sm'にしてスピナーを文字サイズに揃える
  spinnerSize?: keyof typeof SPINNER_SIZE
  // 「−」「＋」のような文言のないボタン。処理中は記号をスピナーに置き換える(幅32pxに両方は入らない)
  iconOnly?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'disabled' | 'type'>) {
  const { pending } = useFormStatus()

  const spinner = (
    <svg className={`${SPINNER_SIZE[spinnerSize]} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      // cursor-waitは「処理中」のときだけ。在庫上限・未入力など呼び出し側の理由で無効化されている
      // ときは、呼び出し側のdisabled:cursor-not-allowed等をそのまま活かす
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${pending ? 'cursor-wait' : ''} ${className ?? ''}`}
      {...rest}
    >
      {pending && spinner}
      {iconOnly && pending ? null : children}
    </button>
  )
}
