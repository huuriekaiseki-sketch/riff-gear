'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRemaining, getReservationExpiresAt } from '@/lib/cartReservation'

// カート明細1件分の在庫確保カウントダウン表示。
// 1秒ごとに残り時間を再計算し、0になったら router.refresh() で
// サーバーコンポーネントを再取得する。実際の削除はカートページ側の
// 遅延削除（lazy deletion）が担うため、ここでは表示と再取得トリガーのみ行う。
export default function ReservationCountdown({ createdAt }: { createdAt: string }) {
  const router = useRouter()
  const expiresAt = getReservationExpiresAt(createdAt)
  const [remainingMs, setRemainingMs] = useState(() => expiresAt - Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      const next = expiresAt - Date.now()
      setRemainingMs(next)
      if (next <= 0) {
        clearInterval(interval)
        router.refresh()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt, router])

  if (remainingMs <= 0) {
    return <p className="mt-1 text-sm text-danger">確保時間が終了しました</p>
  }

  const isWarning = remainingMs < 60_000
  return (
    <p className={`mt-1 text-sm ${isWarning ? 'text-danger' : 'text-gray-500 dark:text-gray-400'}`}>
      在庫確保まであと {formatRemaining(remainingMs)}
    </p>
  )
}
