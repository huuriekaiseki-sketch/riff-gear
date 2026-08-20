'use client'

import Link from 'next/link'
import { useState } from 'react'

type CartPreviewItem = {
  id: string
  name: string
  quantity: number
}

// ヘッダーの「カート」リンク。件数バッジを表示し、ホバー時にカート内容をテキストでプレビューする。
export default function CartNavLink({
  items,
  totalCount,
}: {
  items: CartPreviewItem[]
  totalCount: number
}) {
  const [isHovering, setIsHovering] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Link href="/cart" className="transition-colors hover:text-primary">
        カート{totalCount > 0 && <span className="ml-1 text-primary">({totalCount})</span>}
      </Link>
      {isHovering && items.length > 0 && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-gray-200 bg-surface p-3 text-sm text-foreground shadow-lg dark:border-gray-800">
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-2">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-gray-500 dark:text-gray-400">
                  ×{item.quantity}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
