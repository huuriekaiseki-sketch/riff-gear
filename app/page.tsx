import { createServerSupabaseClient } from '@/lib/supabase/server'
import { addToCart } from './cart/actions'

// 商品一覧ページ。カテゴリ→名前順で全商品を取得し、在庫切れ(stock=0)は
// カート追加ボタンの代わりに「売り切れ」表示に差し替える。
export default async function ProductListPage() {
  const supabase = await createServerSupabaseClient()
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, category, price_cents, stock')
    .order('category')
    .order('name')

  if (error) {
    return <p role="alert">商品の取得に失敗しました: {error.message}</p>
  }

  return (
    <main>
      <h1>Riff Gear</h1>
      <ul>
        {products?.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <span>{p.category}</span>
            <span>¥{p.price_cents.toLocaleString()}</span>
            {p.stock === 0 ? (
              <span>売り切れ</span>
            ) : (
              <form action={addToCart}>
                <input type="hidden" name="productId" value={p.id} />
                <button type="submit">カートに追加</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
