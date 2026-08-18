// 送料無料ラインの計算ロジック。
// 表示専用の機能であり、注文合計金額(place_order)には一切影響しない。
// 閾値を1箇所に集約し、UI側はこの関数の戻り値だけを使う。

export const FREE_SHIPPING_THRESHOLD_CENTS = 10000

export type ShippingProgress = {
  /** 送料無料ラインに到達したか */
  isFree: boolean
  /** あといくらで送料無料か(到達済みなら0) */
  remainingCents: number
  /** プログレスバー用の進捗率(0〜100の整数) */
  percent: number
}

export function getShippingProgress(totalCents: number): ShippingProgress {
  const clamped = Math.max(totalCents, 0)
  const isFree = clamped >= FREE_SHIPPING_THRESHOLD_CENTS
  return {
    isFree,
    remainingCents: isFree ? 0 : FREE_SHIPPING_THRESHOLD_CENTS - clamped,
    percent: isFree
      ? 100
      : Math.floor((clamped / FREE_SHIPPING_THRESHOLD_CENTS) * 100),
  }
}
