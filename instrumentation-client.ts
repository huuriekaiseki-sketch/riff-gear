import * as Sentry from '@sentry/nextjs'

// ブラウザ側のエラーをSentryへ送信する初期化。Next.js 15.3+はこのファイル名
// (instrumentation-client.ts)を自動検出してクライアントバンドルに含める。
// セッションリプレイは今回のスコープ外(個人情報を含む画面録画を送る機能のため)
// なので明示的に無効化しておく。
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
})

// App Router内のページ遷移(ナビゲーション)をSentryのトレースに計測させるためのフック。
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
