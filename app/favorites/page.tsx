import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CATEGORY_LABEL } from '@/lib/categories'
import ProductCard from '@/app/ProductCard'

type FavoriteRow = {
  products: { id: string; name: string; category: string; price_cents: number; stock: number } | null
}

// お気に入り一覧ページ。favoritesとproductsをJOINして、
// 商品一覧と同じProductCardで表示する(カート追加・ハート解除もそのまま使える)。
export default async function FavoritesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return <p className="text-gray-500 dark:text-gray-400">お気に入りを見るにはログインしてください。</p>
  }

  const { data: favorites } = (await supabase
    .from('favorites')
    .select('products(id, name, category, price_cents, stock)')
    .eq('user_id', userData.user.id)) as { data: FavoriteRow[] | null }

  const cartQuantityByProductId = new Map<string, number>()
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

  const products = (favorites ?? []).map((f) => f.products).filter((p): p is NonNullable<typeof p> => p !== null)

  // 再入荷通知の購読状態。売り切れ商品のみ表示するボタンの初期状態に使う
  const restockSubscribedProductIds = new Set<string>()
  const { data: restockSubscriptions } = await supabase
    .from('restock_subscriptions')
    .select('product_id')
    .eq('user_id', userData.user.id)
  for (const sub of restockSubscriptions ?? []) {
    restockSubscribedProductIds.add(sub.product_id)
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">お気に入り</h1>
      {products.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-gray-200 bg-surface px-6 py-16 text-center shadow-sm dark:border-gray-800">
          <p className="text-gray-500 dark:text-gray-400">お気に入りに登録した商品はまだありません。</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            商品を見る
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
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
                }}
                initialRemaining={remaining}
                isFavorited
                isLoggedIn
                isRestockSubscribed={restockSubscribedProductIds.has(p.id)}
              />
            )
          })}
        </ul>
      )}
    </main>
  )
}
