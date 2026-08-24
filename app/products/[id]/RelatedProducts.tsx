import Image from 'next/image'
import Link from 'next/link'
import { CATEGORY_LABEL, CATEGORY_STYLE, DEFAULT_STYLE } from '@/lib/categories'
import PremiumOnlyBadge from '@/app/components/PremiumOnlyBadge'

type RelatedProduct = {
  id: string
  name: string
  category: string
  price_cents: number
  premium_only?: boolean
}

// 商品詳細ページ下部の「関連商品」。同カテゴリ・在庫ありの商品を最大4件、
// サーバーコンポーネントとして描画する(閲覧履歴と違いDBから取得できるため
// クライアント側の状態管理は不要)。
export default function RelatedProducts({ products }: { products: RelatedProduct[] }) {
  if (products.length === 0) return null

  return (
    <section aria-label="関連商品" className="mt-12">
      <h2 className="mb-4 text-lg font-semibold text-foreground">この商品を見た人はこちらも見ています</h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.map((product) => {
          const style = CATEGORY_STYLE[product.category] ?? DEFAULT_STYLE
          const categoryLabel = CATEGORY_LABEL[product.category] ?? product.category
          return (
            <li key={product.id}>
              <Link
                href={`/products/${product.id}`}
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
                <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                <p className="mt-0.5 text-sm font-bold text-foreground">
                  ¥{product.price_cents.toLocaleString()}
                </p>
                {product.premium_only && (
                  <div className="mt-1">
                    <PremiumOnlyBadge />
                  </div>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
