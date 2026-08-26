// 構造化ログ(JSON1行=1イベント)。Vercelのログ基盤でそのままフィルタ・検索できる形式にする。
// request_idを含めることで、1リクエスト内の複数ログ行やSentry上のエラー・
// Slack通知(lib/webhook.ts)を後から相関できるようにする。
type LogLevel = 'info' | 'warn' | 'error'
type LogContext = Record<string, unknown>

function log(level: LogLevel, message: string, context: LogContext = {}): void {
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  })
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
}

// 1リクエストを追跡するためのID。Route Handlerの先頭で1回生成し、
// そのリクエスト内の全ログ・Sentryイベント・Slack通知に含める。
export function newRequestId(): string {
  return crypto.randomUUID()
}
