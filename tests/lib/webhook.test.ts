import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { notifyAdminOfOrder } from '@/lib/webhook'

const BASE_PAYLOAD = {
  orderId: 'order-1',
  userId: 'user-1',
  userEmail: 'user@example.com',
  displayName: 'テスト太郎',
  postalCode: '100-0001',
  address: '東京都千代田区1-1-1',
  phone: '090-0000-0000',
  totalCents: 8800,
  paymentMethod: 'card',
  items: [{ productName: 'Boss DS-1 ディストーション', quantity: 1, priceCentsAtOrder: 8800 }],
}

describe('notifyAdminOfOrder', () => {
  const originalWebhookUrl = process.env.ADMIN_WEBHOOK_URL

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    process.env.ADMIN_WEBHOOK_URL = originalWebhookUrl
  })

  it('ADMIN_WEBHOOK_URL未設定なら何も送信しない', async () => {
    delete process.env.ADMIN_WEBHOOK_URL
    await notifyAdminOfOrder(BASE_PAYLOAD)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('設定済みならWebhook URLへPOSTする', async () => {
    process.env.ADMIN_WEBHOOK_URL = 'https://hooks.slack.example.com/webhook'
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))

    await notifyAdminOfOrder(BASE_PAYLOAD)

    expect(fetch).toHaveBeenCalledWith(
      'https://hooks.slack.example.com/webhook',
      expect.objectContaining({ method: 'POST' })
    )
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    expect(body.text).toContain('order-1')
    expect(body.text).toContain('テスト太郎')
    expect(body.text).toContain('Boss DS-1 ディストーション')
  })

  it('送信失敗(fetchが例外)しても例外を投げない', async () => {
    process.env.ADMIN_WEBHOOK_URL = 'https://hooks.slack.example.com/webhook'
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    await expect(notifyAdminOfOrder(BASE_PAYLOAD)).resolves.toBeUndefined()
  })

  it('レスポンスが失敗ステータスでも例外を投げない', async () => {
    process.env.ADMIN_WEBHOOK_URL = 'https://hooks.slack.example.com/webhook'
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }))

    await expect(notifyAdminOfOrder(BASE_PAYLOAD)).resolves.toBeUndefined()
  })
})
