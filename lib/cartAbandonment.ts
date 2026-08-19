// カート放棄判定のしきい値。追加からこの時間を過ぎても未注文なら「放棄」とみなす。
// 常駐cronサーバーを持たないため、判定自体は管理画面表示時の遅延チェックに任せる。

export const ABANDONMENT_THRESHOLD_MINUTES = 60

export function getAbandonmentCutoffISOString(now: number = Date.now()): string {
  return new Date(now - ABANDONMENT_THRESHOLD_MINUTES * 60_000).toISOString()
}
