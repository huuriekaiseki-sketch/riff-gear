import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CATEGORY_LABEL } from '@/lib/categories'
import { SPEC_LABEL, formatSpecValue } from '@/lib/spec-labels'
import { MAX_COMPARE } from '@/lib/compare'

type ProductRow = {
  id: string
  name: string
  category: string
  price_cents: number
  stock: number
  specs: Record<string, unknown> | null
}

// 商品比較ページ(issue #18)。URLの?ids=a,b,cで比較対象を指定する
// (比較トレイからの遷移のみを想定。直接URLをいじった場合の不正値は
// 「見つからない/カテゴリ不一致」として弾く)。
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>
}) {
  const { ids } = await searchParams
  const idList = [...new Set((ids ?? '').split(',').filter(Boolean))].slice(0, MAX_COMPARE)

  if (idList.length < 2) {
    return (
      <main>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">商品比較</h1>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          比較には商品一覧または商品詳細ページで2〜{MAX_COMPARE}点選んでください。
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-primary hover:underline">
          ← 商品一覧に戻る
        </Link>
      </main>
    )
  }

  const supabase = await createServerSupabaseClient()
  const { data: products } = (await supabase
    .from('products')
    .select('id, name, category, price_cents, stock, specs')
    .in('id', idList)) as { data: ProductRow[] | null }

  const byId = new Map((products ?? []).map((p) => [p.id, p]))
  const ordered = idList.map((id) => byId.get(id)).filter((p): p is ProductRow => p !== undefined)
  const sameCategory = ordered.length >= 2 && ordered.every((p) => p.category === ordered[0].category)

  if (ordered.length < 2 || !sameCategory) {
    return (
      <main>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">商品比較</h1>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          指定された商品を比較できませんでした(商品が見つからないか、異なるカテゴリの商品が含まれています)。
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-primary hover:underline">
          ← 商品一覧に戻る
        </Link>
      </main>
    )
  }

  const specKeys = [...new Set(ordered.flatMap((p) => Object.keys(p.specs ?? {})))]

  return (
    <main>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-foreground dark:text-gray-400"
      >
        ← 商品一覧に戻る
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {CATEGORY_LABEL[ordered[0].category] ?? ordered[0].category}を比較
      </h1>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-28 border-b border-gray-200 pb-3 text-left font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400" />
              {ordered.map((p) => (
                <th
                  key={p.id}
                  className="border-b border-gray-200 px-4 pb-3 text-left font-semibold text-foreground dark:border-gray-800"
                >
                  <Link href={`/products/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="border-b border-gray-100 py-3 text-left font-medium text-gray-500 dark:border-gray-900 dark:text-gray-400">
                価格
              </th>
              {ordered.map((p) => (
                <td key={p.id} className="border-b border-gray-100 px-4 py-3 dark:border-gray-900">
                  ¥{p.price_cents.toLocaleString()}
                </td>
              ))}
            </tr>
            <tr>
              <th className="border-b border-gray-100 py-3 text-left font-medium text-gray-500 dark:border-gray-900 dark:text-gray-400">
                在庫
              </th>
              {ordered.map((p) => (
                <td key={p.id} className="border-b border-gray-100 px-4 py-3 dark:border-gray-900">
                  {p.stock > 0 ? `${p.stock}個` : '売り切れ'}
                </td>
              ))}
            </tr>
            {specKeys.map((key) => (
              <tr key={key}>
                <th className="border-b border-gray-100 py-3 text-left font-medium text-gray-500 dark:border-gray-900 dark:text-gray-400">
                  {SPEC_LABEL[key] ?? key}
                </th>
                {ordered.map((p) => (
                  <td key={p.id} className="border-b border-gray-100 px-4 py-3 dark:border-gray-900">
                    {p.specs && key in p.specs ? formatSpecValue(key, p.specs[key]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
