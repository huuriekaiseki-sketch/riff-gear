// カート内商品の在庫確保カウントダウンの計算ロジック。
// フリマアプリ等でよく見られる「一定時間だけ在庫を確保する」UXを再現する。
// 常駐cronサーバーを持たないため、期限切れの実削除はカートページ表示時の
// 遅延削除（lazy deletion）に任せ、このファイルは残り時間の計算のみ担う。

export const RESERVATION_MINUTES = 15

export function getReservationExpiresAt(createdAt: string): number {
  return new Date(createdAt).getTime() + RESERVATION_MINUTES * 60_000
}

export function getReservationCutoffISOString(now: number = Date.now()): string {
  return new Date(now - RESERVATION_MINUTES * 60_000).toISOString()
}

export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
