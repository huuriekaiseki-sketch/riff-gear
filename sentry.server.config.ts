import * as Sentry from '@sentry/nextjs'

// server(Node.jsランタイム)側のエラー・パフォーマンスをSentryへ送信する初期化。
// NEXT_PUBLIC_SENTRY_DSNが未設定の場合、Sentry SDKは自動的に何も送信しない
// (ADMIN_WEBHOOK_URLと同じ「未設定ならno-op」のパターン)。
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
})
