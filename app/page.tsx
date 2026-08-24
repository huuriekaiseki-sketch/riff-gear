import { createServerSupabaseClient } from '@/lib/supabase/server'
import ProductCard from './ProductCard'
import RecentlyViewed from './components/RecentlyViewed'
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/categories'

// 商品一覧ページ。カテゴリ→名前順で全商品を取得し、在庫切れ(stock=0)、
// または既に自分のカートに在庫上限まで入れている場合は
// カート追加ボタンの代わりに「売り切れ」表示に差し替える。

export default async function ProductListPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; category?: string; q?: string }>
}) {
  const { error: errorMessage, category, q } = await searchParams
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('products')
    .select('id, name, category, price_cents, stock, premium_only')
    .order('category')
    .order('name')

  // 不正なカテゴリ値が来た場合は無視して全件表示にフォールバックする
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    query = query.eq('category', category)
  }
  if (q) {
    query = query.ilike('name', `%${q}%`)
  }

  const { data: products, error } = await query

  if (error) {
    return <p role="alert">商品の取得に失敗しました: {error.message}</p>
  }

  // ログイン中なら、自分のカートに既に入っている数量を商品ごとに取得し、
  // 「在庫 − カート内数量」を実質の残数として扱う。
  const { data: userData } = await supabase.auth.getUser()
  const cartQuantityByProductId = new Map<string, number>()
  const favoritedProductIds = new Set<string>()
  if (userData.user) {
    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (cart) {
      const { data: cartItems } = await supabase
        .from('cart_items')
        .select('product_id, quantity')
        .eq('cart_id', cart.id)
      for (const item of cartItems ?? []) {
        cartQuantityByProductId.set(item.product_id, item.quantity)
      }
    }

    const { data: favorites } = await supabase
      .from('favorites')
      .select('product_id')
      .eq('user_id', userData.user.id)
    for (const fav of favorites ?? []) {
      favoritedProductIds.add(fav.product_id)
    }
  }

  return (
    <main>
      <div className="relative mb-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 blur-3xl"
        />
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Riff Gear</h1>
        <p className="mt-3 text-base text-gray-500 dark:text-gray-400">
          ギター・キーボードなど、バンド機材のセレクトショップ
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {products?.length ?? 0}件表示中
        </p>
      </div>
      {errorMessage && (
        <p role="alert" className="mb-6 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <form className="mb-6 flex flex-wrap items-center gap-3" action="/">
        {category && <input type="hidden" name="category" value={category} />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="商品名で検索"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />
        <button
          type="submit"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700"
        >
          検索
        </button>
      </form>
      <nav className="mb-8 flex flex-wrap gap-2" aria-label="カテゴリ絞り込み">
        <a
          href={q ? `/?q=${encodeURIComponent(q)}` : '/'}
          className={`rounded-full px-4 py-1.5 text-sm ${
            !category
              ? 'bg-foreground text-background'
              : 'border border-gray-300 dark:border-gray-700'
          }`}
        >
          すべて
        </a>
        {CATEGORIES.map((c) => {
          const href = `/?category=${c}${q ? `&q=${encodeURIComponent(q)}` : ''}`
          return (
            <a
              key={c}
              href={href}
              className={`rounded-full px-4 py-1.5 text-sm ${
                category === c
                  ? 'bg-foreground text-background'
                  : 'border border-gray-300 dark:border-gray-700'
              }`}
            >
              {CATEGORY_LABEL[c]}
            </a>
          )
        })}
      </nav>
      {products?.length === 0 && (
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">該当する商品が見つかりませんでした。</p>
      )}
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products?.map((p) => {
          const remaining = p.stock - (cartQuantityByProductId.get(p.id) ?? 0)
          return (
            <ProductCard
              key={p.id}
              product={{
                id: p.id,
                name: p.name,
                category: p.category,
                categoryLabel: CATEGORY_LABEL[p.category] ?? p.category,
                price_cents: p.price_cents,
                premiumOnly: p.premium_only ?? false,
              }}
              initialRemaining={remaining}
              isFavorited={userData.user ? favoritedProductIds.has(p.id) : undefined}
            />
          )
        })}
      </ul>
      <RecentlyViewed />
    </main>
  )
}
