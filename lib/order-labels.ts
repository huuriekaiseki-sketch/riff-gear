// 注文ステータスの表示用日本語ラベルとバッジ色
export const STATUS_LABEL: Record<string, string> = {
  received: '注文受付',
  preparing: '発送準備',
  shipped: '発送済み',
  cancelled: 'キャンセル',
}
export const STATUS_COLOR: Record<string, string> = {
  received: 'bg-secondary/10 text-secondary',
  preparing: 'bg-warning/10 text-warning',
  shipped: 'bg-success/10 text-success',
  cancelled: 'bg-danger/10 text-danger',
}

// 支払い方法・支払いステータスの表示用日本語ラベル
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: 'クレジットカード',
  bank_transfer: '銀行振込',
  cod: '代金引換',
  convenience_store: 'コンビニ支払い',
  qr_code: 'QRコード決済',
}
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: '支払い待ち',
  paid: '支払い済み',
}
