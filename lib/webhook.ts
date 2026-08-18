export type OrderWebhookPayload = {
  orderId: string
  userId: string
  userEmail: string | null
  displayName: string | null
  postalCode: string | null
  address: string | null
  phone: string | null
  totalCents: number
  paymentMethod: string
  items: { productName: string; quantity: number; priceCentsAtOrder: number }[]
}

export type LowStockItem = { productName: string; stock: number }

const DEFAULT_LOW_STOCK_THRESHOLD = 5

// 閾値は環境変数LOW_STOCK_THRESHOLDで調整可能(未設定・不正値時はデフォルト5)。
export function getLowStockThreshold(): number {
  const raw = process.env.LOW_STOCK_THRESHOLD
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_LOW_STOCK_THRESHOLD
}

function formatYen(cents: number): string {
  return `¥${cents.toLocaleString('ja-JP')}`
}

function buildSlackMessage(payload: OrderWebhookPayload): string {
  const itemLines = payload.items
    .map((item) => `  - ${item.productName} x${item.quantity} (${formatYen(item.priceCentsAtOrder)})`)
    .join('\n')

  return [
    ':bell: 新しい注文が入りました',
    `注文ID: ${payload.orderId}`,
    `ユーザー: ${payload.displayName ?? '未設定'} / ${payload.userEmail ?? '不明'} (${payload.userId})`,
    `お届け先: ${payload.postalCode ?? '未設定'} ${payload.address ?? ''}`.trim(),
    `電話番号: ${payload.phone ?? '未設定'}`,
    `支払い方法: ${payload.paymentMethod}`,
    `合計: ${formatYen(payload.totalCents)}`,
    '注文内容:',
    itemLines,
  ].join('\n')
}

// 注文確定を管理者のSlackへ通知する。ADMIN_WEBHOOK_URL未設定、または送信失敗時も
// 例外を投げない(ベストエフォート) — 注文確定自体をWebhookの成否に依存させないため。
export async function notifyAdminOfOrder(payload: OrderWebhookPayload): Promise<void> {
  const webhookUrl = process.env.ADMIN_WEBHOOK_URL
  if (!webhookUrl) return

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: buildSlackMessage(payload) }),
    })
    if (!response.ok) {
      console.error(`注文Webhook通知に失敗しました: status=${response.status}`)
    }
  } catch (err) {
    console.error('注文Webhook通知に失敗しました', err)
  }
}

function buildLowStockMessage(items: LowStockItem[]): string {
  const itemLines = items.map((item) => `  - ${item.productName}: 残り${item.stock}個`).join('\n')
  return [':warning: 在庫が少なくなっている商品があります', itemLines].join('\n')
}

// 在庫僅少を管理者のSlackへ通知する。notifyAdminOfOrderと同様にベストエフォート。
export async function notifyAdminOfLowStock(items: LowStockItem[]): Promise<void> {
  if (items.length === 0) return

  const webhookUrl = process.env.ADMIN_WEBHOOK_URL
  if (!webhookUrl) return

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: buildLowStockMessage(items) }),
    })
    if (!response.ok) {
      console.error(`在庫僅少Webhook通知に失敗しました: status=${response.status}`)
    }
  } catch (err) {
    console.error('在庫僅少Webhook通知に失敗しました', err)
  }
}
