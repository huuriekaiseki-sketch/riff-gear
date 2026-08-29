// 未発送のまま長期間経過した注文を検知する判定ロジック
export const UNSHIPPED_STATUSES = ['received', 'preparing'] as const
export const UNSHIPPED_ALERT_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

export function isOverdueUnshipped(status: string, createdAt: string): boolean {
  return (
    (UNSHIPPED_STATUSES as readonly string[]).includes(status) &&
    Date.now() - new Date(createdAt).getTime() > UNSHIPPED_ALERT_THRESHOLD_MS
  )
}
