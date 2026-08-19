'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { clearCompare, getCompareSnapshot, getServerSnapshot, subscribeCompare } from '@/lib/compare'

// 画面下部に固定表示する比較トレイ。2点以上選ばれたら「比較する」導線を出す。
// 全ページ共通(layout.tsx)に置くので、レイアウトを崩さないようfixed+z-indexで重ねる。
export default function CompareTray() {
  const state = useSyncExternalStore(subscribeCompare, getCompareSnapshot, getServerSnapshot)

  if (!state || state.ids.length < 2) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-surface/95 backdrop-blur dark:border-gray-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <p className="text-sm text-foreground">{state.ids.length}点を比較選択中</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clearCompare}
            className="text-sm text-gray-500 hover:underline dark:text-gray-400"
          >
            クリア
          </button>
          <Link
            href={`/compare?ids=${state.ids.join(',')}`}
            className="rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-sm font-medium text-white shadow-md hover:scale-105"
          >
            比較する
          </Link>
        </div>
      </div>
    </div>
  )
}
