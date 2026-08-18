import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CATEGORY_LABEL, CATEGORY_STYLE, DEFAULT_STYLE } from '@/lib/categories'
import { addToCart } from '@/app/cart/actions'
import FavoriteButton from '@/app/favorites/FavoriteButton'
import ReturnWarrantyBadge from '@/app/components/ReturnWarrantyBadge'
import RecordView from './RecordView'
import RelatedProducts from './RelatedProducts'

const RELATED_LIMIT = 4

// 商品詳細ページ。一覧と同じく「在庫 − 自分のカート内数量」を実質の残数として
// 扱い、残数0なら売り切れ表示に差し替える。閲覧はRecordView(クライアント)経由で
// localStorageの「最近見た商品」履歴に記録される。
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  // 不正なUUID等でクエリ自体がエラーになった場合も「商品が見つからない」扱いにする
  const { data: product, error } = await supabase
    .from('products')
    .select('id, name, category, price_cents, stock')
    .eq('id', id)
    .maybeSingle()
  if (error || !product) notFound()

  const { data: userData } = await supabase.auth.getUser()
  let quantityInCart = 0
  let isFavorited = false
  if (userData.user) {
    const { data: favorite } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userData.user.id)
      .eq('product_id', product.id)
      .maybeSingle()
    isFavorited = !!favorite

    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (cart) {
      const { data: cartItem } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('cart_id', cart.id)
        .eq('product_id', product.id)
        .maybeSingle()
      quantityInCart = cartItem?.quantity ?? 0
    }
  }
  const remaining = product.stock - quantityInCart

  const categoryLabel = CATEGORY_LABEL[product.category] ?? product.category
  const style = CATEGORY_STYLE[product.category] ?? DEFAULT_STYLE

  // 同カテゴリ・在庫あり・自分自身を除いた商品を関連商品として表示する
  const { data: relatedProducts } = await supabase
    .from('products')
    .select('id, name, category, price_cents')
    .eq('category', product.category)
    .neq('id', product.id)
    .gt('stock', 0)
    .order('name')
    .limit(RELATED_LIMIT)

  return (
    <main>
      <RecordView
        product={{
          id: product.id,
          name: product.name,
          category: product.category,
          price_cents: product.price_cents,
        }}
      />
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-foreground dark:text-gray-400"
      >
        ← 商品一覧に戻る
      </Link>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="relative h-64 overflow-hidden rounded-2xl shadow-inner md:h-80">
          <Image
            src={style.photoUrl}
            alt={categoryLabel}
            fill
            priority
            sizes="(min-width: 768px) 50vw, 90vw"
            className="object-cover"
          />
          <div className={`absolute inset-0 bg-gradient-to-t ${style.gradient} opacity-25`} />
        </div>
        <div>
          <span
            className={`inline-block rounded-full bg-gradient-to-r px-3 py-1 text-xs font-semibold text-white shadow-sm ${style.gradient}`}
          >
            {categoryLabel}
          </span>
          <div className="mt-4 flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{product.name}</h1>
            {userData.user && (
              <FavoriteButton productId={product.id} initialIsFavorited={isFavorited} />
            )}
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            ¥{product.price_cents.toLocaleString()}
          </p>
          {remaining > 0 &&
            (remaining <= 3 ? (
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">
                残りわずか{remaining}点
              </span>
            ) : (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">残り{remaining}個</p>
            ))}
          {remaining <= 0 ? (
            <span className="mt-6 inline-flex w-fit items-center rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              売り切れ
            </span>
          ) : (
            <form action={addToCart} className="mt-6">
              <input type="hidden" name="productId" value={product.id} />
              <button
                type="submit"
                className="rounded-full bg-gradient-to-r from-primary to-secondary px-8 py-2.5 text-sm font-medium text-white shadow-md transition-all duration-150 hover:scale-105 hover:shadow-lg hover:shadow-primary/30"
              >
                カートに追加
              </button>
            </form>
          )}
          <div className="mt-6">
            <ReturnWarrantyBadge />
          </div>
        </div>
      </div>
      <RelatedProducts products={relatedProducts ?? []} />
    </main>
  )
}
