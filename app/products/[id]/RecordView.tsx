'use client'

import { useEffect } from 'react'
import { recordView } from '@/lib/recently-viewed'

// 商品詳細ページの閲覧をlocalStorageの履歴に記録する。
// 記録はブラウザ側でしかできないため、サーバーコンポーネントの詳細ページから
// このクライアントコンポーネントを埋め込む(画面には何も描画しない)。
export default function RecordView({
  product,
}: {
  product: { id: string; name: string; category: string; price_cents: number }
}) {
  useEffect(() => {
    recordView(product)
  }, [product.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
