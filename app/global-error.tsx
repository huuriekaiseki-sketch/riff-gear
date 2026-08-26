'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// ルートレイアウト自体が壊れるような、エラーバウンダリで捕まえきれない
// 描画エラーの最終防波堤。App Routerの規約により、このファイルは
// 独自の<html>/<body>を持つ必要がある(RootLayoutを置き換えるため)。
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="ja">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="alert" className="text-lg font-semibold text-danger">
          予期しないエラーが発生しました
        </p>
        <p className="text-sm text-gray-500">
          お手数ですがページを再読み込みしてください。問題が解決しない場合は運営までご連絡ください。
        </p>
      </body>
    </html>
  )
}
