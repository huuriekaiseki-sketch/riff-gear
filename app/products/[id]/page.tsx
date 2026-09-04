import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CATEGORY_LABEL, CATEGORY_STYLE, DEFAULT_STYLE } from '@/lib/categories'
import { addToCart } from '@/app/cart/actions'
import FavoriteButton from '@/app/favorites/FavoriteButton'
import ReturnWarrantyBadge from '@/app/components/ReturnWarrantyBadge'
import CompareCheckbox from '@/app/components/CompareCheckbox'
import PremiumOnlyBadge from '@/app/components/PremiumOnlyBadge'
import { SPEC_LABEL, formatSpecValue } from '@/lib/spec-labels'
import RecordView from './RecordView'
import RelatedProducts from './RelatedProducts'
import ReviewForm from '@/app/reviews/ReviewForm'
import ReviewList from '@/app/reviews/ReviewList'
import SubmitButton from '@/app/components/SubmitButton'
import { summarizeRatings, countVotesByReviewId, sortReviewsByHelpfulness } from '@/lib/reviews'
import { pickTopCoPurchasedIds, type CoPurchasedProduct } from '@/lib/co-purchase'

const RELATED_LIMIT = 4
const CO_PURCHASED_LIMIT = 4

// 商品詳細ページ。一覧と同じく「在庫 − 自分のカート内数量」を実質の残数として
// 扱い、残数0なら売り切れ表示に差し替える。閲覧はRecordView(クライアント)経由で
// localStorageの「最近見た商品」履歴に記録される。
export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ reviewError?: string }>
}) {
  const { id } = await params
  const { reviewError } = await searchParams
  const supabase = await createServerSupabaseClient()

  // 不正なUUID等でクエリ自体がエラーになった場合も「商品が見つからない」扱いにする
  const { data: product, error } = await supabase
    .from('products')
    .select('id, name, category, price_cents, member_price_cents, stock, specs, premium_only')
    .eq('id', id)
    .maybeSingle()
  if (error || !product) notFound()

  const specs = (product.specs ?? {}) as Record<string, unknown>
  const specEntries = Object.entries(specs)

  const { data: userData } = await supabase.auth.getUser()
  let quantityInCart = 0
  let isFavorited = false
  let hasPurchased = false
  let isPremiumMember = false
  let myReview: { rating: number; comment: string | null } | null = null
  if (userData.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('membership')
      .eq('id', userData.user.id)
      .maybeSingle()
    isPremiumMember = profile?.membership === 'premium'
    const { data: purchase } = await supabase
      .from('order_items')
      .select('id, orders!inner(user_id, status)')
      .eq('product_id', product.id)
      .eq('orders.user_id', userData.user.id)
      .neq('orders.status', 'cancelled')
      .limit(1)
      .maybeSingle()
    hasPurchased = !!purchase

    const { data: existingReview } = await supabase
      .from('reviews')
      .select('rating, comment')
      .eq('user_id', userData.user.id)
      .eq('product_id', product.id)
      .maybeSingle()
    myReview = existingReview ?? null

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
  const showMemberPrice = isPremiumMember && product.member_price_cents != null

  // 同カテゴリ・在庫あり・自分自身を除いた商品を関連商品として表示する
  const { data: relatedProducts } = await supabase
    .from('products')
    .select('id, name, category, price_cents, premium_only')
    .eq('category', product.category)
    .neq('id', product.id)
    .gt('stock', 0)
    .order('name')
    .limit(RELATED_LIMIT)

  // 「一緒に購入されている商品」(Issue #78)。get_co_purchased_products RPCで
  // 共起回数を集計し、上位IDだけをJS側で選んでからproductsを再フェッチする。
  // 在庫あり(stock > 0)のみに絞り、会員限定商品はproducts側のRLS(0018)により
  // 非会員には自動的に返らない(ここで明示的な絞り込みは不要)。
  const { data: coPurchaseRows } = await supabase.rpc('get_co_purchased_products', {
    target_product_id: product.id,
  })
  const coPurchasedIds = pickTopCoPurchasedIds(
    coPurchaseRows as CoPurchasedProduct[] | null,
    CO_PURCHASED_LIMIT,
  )
  let coPurchasedProducts: {
    id: string
    name: string
    category: string
    price_cents: number
    premium_only?: boolean
  }[] = []
  if (coPurchasedIds.length > 0) {
    const { data: coPurchasedRaw } = await supabase
      .from('products')
      .select('id, name, category, price_cents, premium_only')
      .in('id', coPurchasedIds)
      .gt('stock', 0)
    // フェッチ結果はin()の順序を保証しないため、共起回数の順序(coPurchasedIds)に
    // 合わせて並べ直す。RLSで落ちた行はfindでundefinedになりfilterで除外される。
    coPurchasedProducts = coPurchasedIds
      .map((id) => coPurchasedRaw?.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p != null)
  }

  const { data: reviewsRaw } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, user_id')
    .eq('product_id', product.id)
    .order('created_at', { ascending: false })
  const { average, count } = summarizeRatings((reviewsRaw ?? []).map((r) => r.rating))

  // 「参考になった」投票は未ログインにも件数を見せるため、reviewsとは別クエリで
  // 全投票行を取得する(RLSのselectはanonにも許可されている想定)。
  // 表示順は投票数降順・同数は新しい順に並べ替える。
  const reviewIds = (reviewsRaw ?? []).map((r) => r.id)
  const { data: helpfulVotes } =
    reviewIds.length > 0
      ? await supabase.from('review_helpful_votes').select('review_id, user_id').in('review_id', reviewIds)
      : { data: [] as { review_id: string; user_id: string }[] }
  const helpfulCountByReviewIdMap = countVotesByReviewId(helpfulVotes ?? [])
  const reviews = sortReviewsByHelpfulness(reviewsRaw ?? [], helpfulCountByReviewIdMap)
  const helpfulCountByReviewId = Object.fromEntries(helpfulCountByReviewIdMap)
  const votedReviewIds = (helpfulVotes ?? [])
    .filter((v) => v.user_id === userData.user?.id)
    .map((v) => v.review_id)

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
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded-full bg-gradient-to-r px-3 py-1 text-xs font-semibold text-white shadow-sm ${style.gradient}`}
            >
              {categoryLabel}
            </span>
            {product.premium_only && <PremiumOnlyBadge />}
          </div>
          <div className="mt-4 flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{product.name}</h1>
            {userData.user && (
              <FavoriteButton productId={product.id} initialIsFavorited={isFavorited} />
            )}
          </div>
          {showMemberPrice ? (
            <div className="mt-3">
              <p className="text-base text-gray-500 line-through dark:text-gray-400">
                ¥{product.price_cents.toLocaleString()}
              </p>
              <p className="flex items-center gap-2 text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                ¥{product.member_price_cents!.toLocaleString()}
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  会員価格
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
              ¥{product.price_cents.toLocaleString()}
            </p>
          )}
          {count > 0 && (
            <p className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="text-warning">★</span>
              {average}({count}件)
            </p>
          )}
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
              <SubmitButton className="rounded-full bg-gradient-to-r from-primary to-secondary px-8 py-2.5 text-sm font-medium text-white shadow-md transition-all duration-150 hover:scale-105 hover:shadow-lg hover:shadow-primary/30 disabled:opacity-80 disabled:hover:scale-100">
                カートに追加
              </SubmitButton>
            </form>
          )}
          <div className="mt-6">
            <ReturnWarrantyBadge />
          </div>
          {specEntries.length > 0 && (
            <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {specEntries.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-gray-500 dark:text-gray-400">{SPEC_LABEL[key] ?? key}</dt>
                  <dd className="text-foreground">{formatSpecValue(key, value)}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-4">
            <CompareCheckbox productId={product.id} category={product.category} />
          </div>
        </div>
      </div>
      {coPurchasedProducts.length > 0 && (
        <RelatedProducts
          heading="この商品を買った人はこんな商品も買っています"
          products={coPurchasedProducts}
        />
      )}
      <RelatedProducts products={relatedProducts ?? []} />
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">レビュー</h2>
        {reviewError && (
          <p role="alert" className="mt-2 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
            {reviewError}
          </p>
        )}
        <ReviewList
          productId={product.id}
          reviews={reviews}
          currentUserId={userData.user?.id}
          helpfulCountByReviewId={helpfulCountByReviewId}
          votedReviewIds={votedReviewIds}
        />
        {hasPurchased && (
          <ReviewForm
            productId={product.id}
            initialRating={myReview?.rating}
            initialComment={myReview?.comment ?? undefined}
          />
        )}
      </section>
    </main>
  )
}
