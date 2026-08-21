import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import CartNavLink from './CartNavLink'

type CartItemPreviewRow = {
  id: string
  quantity: number
  products: { name: string } | { name: string }[]
}

// 全ページ共通のヘッダー。ログイン状態・管理者権限に応じてナビ項目を出し分ける。
export default async function SiteHeader() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  const isLoggedIn = !!userData.user
  const isAdmin = userData.user?.app_metadata?.role === 'admin'

  let displayName: string | null = null
  let cartItems: { id: string; name: string; quantity: number }[] = []
  if (isLoggedIn) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userData.user!.id)
      .maybeSingle()
    displayName = profile?.display_name || null

    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userData.user!.id)
      .maybeSingle()

    if (cart) {
      const { data: items } = (await supabase
        .from('cart_items')
        .select('id, quantity, products(name)')
        .eq('cart_id', cart.id)) as { data: CartItemPreviewRow[] | null }

      cartItems = (items ?? []).map((item) => ({
        id: item.id,
        quantity: item.quantity,
        name: Array.isArray(item.products) ? item.products[0]?.name ?? '' : item.products.name,
      }))
    }
  }
  const cartTotalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/80 backdrop-blur-md dark:border-gray-800/80 dark:bg-black/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            Riff Gear
          </Link>
          {displayName && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ようこそ、{displayName}さん
            </span>
          )}
        </div>
        <nav className="flex items-center gap-6 text-sm font-medium text-gray-600 dark:text-gray-300">
          <Link href="/" className="transition-colors hover:text-primary">
            商品一覧
          </Link>
          {isLoggedIn && (
            <>
              <Link href="/favorites" className="transition-colors hover:text-primary">
                お気に入り
              </Link>
              <CartNavLink items={cartItems} totalCount={cartTotalCount} />
              <Link href="/orders" className="transition-colors hover:text-primary">
                注文履歴
              </Link>
              <Link href="/profile" className="transition-colors hover:text-primary">
                プロフィール
              </Link>
            </>
          )}
          {isAdmin && (
            <Link href="/admin/orders" className="transition-colors hover:text-primary">
              管理者
            </Link>
          )}
          {!isLoggedIn && (
            <Link
              href="/login"
              className="rounded-full bg-primary px-4 py-1.5 text-white transition-opacity hover:opacity-90"
            >
              ログイン
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
