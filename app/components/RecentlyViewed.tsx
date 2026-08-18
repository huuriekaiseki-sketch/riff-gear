'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CATEGORY_LABEL, CATEGORY_STYLE, DEFAULT_STYLE } from '@/lib/categories'
import { loadRecentlyViewed, type RecentlyViewedItem } from '@/lib/recently-viewed'

const MAX_DISPLAY = 4

// トップページ下部の「最近見た商品」。履歴はlocalStorageにしか無いため
// クライアントコンポーネントとして初回マウント時に読み出す。
// SSRでは履歴が空でレンダリングされるので、useEffectで読むことで
// サーバーとクライアントのHTML不一致(hydration error)を避けている。
export default function RecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([])

  useEffect(() => {
    setItems(loadRecentlyViewed().slice(0, MAX_DISPLAY))
  }, [])

  if (items.length === 0) return null

  return (
    <section aria-label="最近見た商品" className="mt-12">
      <h2 className="mb-4 text-lg font-semibold text-foreground">最近見た商品</h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => {
          const style = CATEGORY_STYLE[item.category] ?? DEFAULT_STYLE
          const categoryLabel = CATEGORY_LABEL[item.category] ?? item.category
          return (
            <li key={item.id}>
              <Link
                href={`/products/${item.id}`}
                className="group block rounded-xl border border-gray-200/60 bg-surface p-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800/60"
              >
                <div className="relative mb-2 h-16 overflow-hidden rounded-lg">
                  <Image
                    src={style.photoUrl}
                    alt={categoryLabel}
                    fill
                    sizes="(min-width: 640px) 22vw, 45vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-t ${style.gradient} opacity-25`} />
                </div>
                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                <p className="mt-0.5 text-sm font-bold text-foreground">
                  ¥{item.price_cents.toLocaleString()}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
