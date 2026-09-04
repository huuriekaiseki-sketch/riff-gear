import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createProduct, updateProduct } from './actions'
import SubmitButton from '@/app/components/SubmitButton'

type ProductRow = {
  id: string
  name: string
  category: string
  price_cents: number
  stock: number
  image_url: string | null
  premium_only: boolean
  member_price_cents: number | null
}

// 管理者向け商品管理ページ（CRUD + 在庫調整）。公開/非公開フラグは対象外（Issue #72）。
// app_metadata.role のチェックはUI表示上の防御多層化に過ぎず、
// 実際の書き込み制御はDB側のRLS（products_write_admin_only, is_admin()ゲート）が担う。
export default async function AdminProductsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  const isAdmin = userData.user?.app_metadata?.role === 'admin'

  if (!isAdmin) {
    return (
      <p role="alert" className="text-danger">
        このページには管理者のみアクセスできます。
      </p>
    )
  }

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, category, price_cents, stock, image_url, premium_only, member_price_cents')
    .order('created_at', { ascending: false })
    .returns<ProductRow[]>()

  if (error) {
    return (
      <p role="alert" className="text-danger">
        商品一覧の取得に失敗しました: {error.message}
      </p>
    )
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">商品管理</h1>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
        <h2 className="text-lg font-semibold text-foreground">新規商品を追加</h2>
        <form action={createProduct} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            商品名
            <input
              type="text"
              name="name"
              required
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            カテゴリ
            <input
              type="text"
              name="category"
              required
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            価格（円）
            <input
              type="number"
              name="price_cents"
              min={0}
              step={1}
              required
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            在庫数
            <input
              type="number"
              name="stock"
              min={0}
              step={1}
              required
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300 sm:col-span-2">
            画像URL（任意）
            <input
              type="url"
              name="image_url"
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            会員価格（円・任意）
            <input
              type="number"
              name="member_price_cents"
              min={0}
              step={1}
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" name="premium_only" className="h-4 w-4 rounded border-gray-300" />
            会員限定商品にする
          </label>
          <div className="sm:col-span-2">
            <SubmitButton className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60">
              商品を追加
            </SubmitButton>
          </div>
        </form>
      </section>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-surface shadow-sm dark:border-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-6 py-3 font-medium">商品名</th>
              <th className="px-6 py-3 font-medium">カテゴリ</th>
              <th className="px-6 py-3 font-medium">価格</th>
              <th className="px-6 py-3 font-medium">在庫</th>
              <th className="px-6 py-3 font-medium">会員限定</th>
              <th className="px-6 py-3 font-medium">会員価格</th>
              <th className="px-6 py-3 font-medium">更新</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {products?.map((product) => (
              <tr key={product.id}>
                <td colSpan={7} className="p-0">
                  <form
                    action={updateProduct}
                    className="grid grid-cols-1 items-center gap-2 px-6 py-4 sm:grid-cols-7"
                  >
                    <input type="hidden" name="productId" value={product.id} />
                    <input
                      type="text"
                      name="name"
                      defaultValue={product.name}
                      required
                      className="rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
                    />
                    <input
                      type="text"
                      name="category"
                      defaultValue={product.category}
                      required
                      className="rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
                    />
                    <input
                      type="number"
                      name="price_cents"
                      defaultValue={product.price_cents}
                      min={0}
                      step={1}
                      required
                      className="w-24 rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
                    />
                    <input
                      type="number"
                      name="stock"
                      defaultValue={product.stock}
                      min={0}
                      step={1}
                      required
                      aria-label={`${product.name}の在庫数`}
                      className="w-20 rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
                    />
                    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        name="premium_only"
                        defaultChecked={product.premium_only}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      会員限定
                    </label>
                    <input
                      type="number"
                      name="member_price_cents"
                      defaultValue={product.member_price_cents ?? ''}
                      min={0}
                      step={1}
                      placeholder="未設定"
                      className="w-24 rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
                    />
                    <SubmitButton
                      spinnerSize="sm"
                      className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      更新
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
