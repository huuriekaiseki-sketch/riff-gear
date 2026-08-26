import * as Sentry from '@sentry/nextjs'

// Next.jsのランタイム別(nodejs/edge)にSentry初期化ファイルを読み込む。
// App Routerの規約に従い、このファイルはNext.jsが起動時に自動で呼び出す。
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Server Actions・Route Handler内で発生した未捕捉エラーをSentryへ送るフック。
export const onRequestError = Sentry.captureRequestError
