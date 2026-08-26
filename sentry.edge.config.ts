import * as Sentry from '@sentry/nextjs'

// Edgeランタイム(middleware等)側のエラーをSentryへ送信する初期化。
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
})
