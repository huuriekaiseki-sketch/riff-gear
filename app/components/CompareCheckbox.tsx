'use client'

import { useSyncExternalStore } from 'react'
import {
  MAX_COMPARE,
  getCompareSnapshot,
  getServerSnapshot,
  subscribeCompare,
  updateCompare,
} from '@/lib/compare'

// 商品カード・詳細ページに置く「比較する」チェックボックス。
// 比較選択は異なるカテゴリを混在させられないため、選択中と別カテゴリの
// 商品では無効化する(仕様項目がカテゴリごとに違うため)。
export default function CompareCheckbox({ productId, category }: { productId: string; category: string }) {
  const state = useSyncExternalStore(subscribeCompare, getCompareSnapshot, getServerSnapshot)
  const checked = state?.ids.includes(productId) ?? false
  const otherCategorySelected = !!state && state.category !== category
  const atMax = !!state && !checked && state.ids.length >= MAX_COMPARE
  const disabled = otherCategorySelected || atMax

  return (
    <label
      className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
      title={
        otherCategorySelected
          ? '比較は同じカテゴリの商品同士のみ選べます'
          : atMax
            ? `比較できるのは最大${MAX_COMPARE}点までです`
            : undefined
      }
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => updateCompare({ id: productId, category })}
        className="h-3.5 w-3.5 rounded border-gray-300 disabled:cursor-not-allowed dark:border-gray-700"
      />
      比較する
    </label>
  )
}
