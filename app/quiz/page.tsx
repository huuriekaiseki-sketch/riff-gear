import Image from 'next/image'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { toSalesCountMap } from '@/lib/product-sort'
import { CATEGORY_LABEL, CATEGORY_STYLE, DEFAULT_STYLE } from '@/lib/categories'
import { parseQuizParams, scoreQuizProducts } from '@/lib/quiz'
import PremiumOnlyBadge from '@/app/components/PremiumOnlyBadge'
import QuizForm from './QuizForm'

// 「あなたにぴったりの機材診断」(Issue #80)。
// searchParamsに3問ぶんの回答が有効な値で揃っていれば結果を、
// 揃っていなければ質問フォーム(QuizForm)を表示する。
// 販売数の集計は既存の人気順機能(0021)のRPCをそのまま流用し、
// 診断専用の集計は持たない。
export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; budget?: string; focus?: string }>
}) {
  const rawParams = await searchParams
  const answers = parseQuizParams(rawParams)

  if (!answers) {
    return (
      <main>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            あなたにぴったりの機材診断
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            3つの質問に答えるだけで、おすすめの機材を3つご紹介します
          </p>
        </div>
        <QuizForm />
      </main>
    )
  }

  const supabase = await createServerSupabaseClient()
  const { data: fetchedProducts, error } = await supabase
    .from('products')
    .select('id, name, category, price_cents, member_price_cents, premium_only, stock, specs')
    .gt('stock', 0)

  if (error) {
    return <p role="alert">商品の取得に失敗しました: {error.message}</p>
  }

  const { data: salesCounts } = await supabase.rpc('get_product_sales_counts')
  const salesCountByProductId = toSalesCountMap(salesCounts)

  const recommendedProducts = scoreQuizProducts(
    fetchedProducts ?? [],
    answers,
    salesCountByProductId,
  )

  return (
    <main>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">あなたへのおすすめ</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          診断結果にもとづくおすすめの機材です
        </p>
      </div>

      {recommendedProducts.length === 0 ? (
        <div className="rounded-2xl border border-gray-200/60 bg-surface p-8 text-center dark:border-gray-800/60">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            条件に合う商品が見つかりませんでした。
          </p>
          <Link
            href="/quiz"
            className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            もう一度診断する
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {recommendedProducts.map((product, index) => {
              const style = CATEGORY_STYLE[product.category] ?? DEFAULT_STYLE
              const categoryLabel = CATEGORY_LABEL[product.category] ?? product.category
              const isTop = index === 0
              return (
                <li key={product.id} className={isTop ? 'sm:col-span-3' : undefined}>
                  <Link
                    href={`/products/${product.id}`}
                    className="group block rounded-2xl border border-gray-200/60 bg-surface p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800/60"
                  >
                    <div
                      className={`relative mb-3 overflow-hidden rounded-xl ${isTop ? 'h-48' : 'h-24'}`}
                    >
                      <Image
                        src={style.photoUrl}
                        alt={categoryLabel}
                        fill
                        sizes={isTop ? '100vw' : '(min-width: 640px) 30vw, 90vw'}
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className={`absolute inset-0 bg-gradient-to-t ${style.gradient} opacity-25`} />
                      {isTop && (
                        <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                          1位のおすすめ
                        </span>
                      )}
                    </div>
                    <p className={`truncate font-medium text-foreground ${isTop ? 'text-xl' : 'text-sm'}`}>
                      {product.name}
                    </p>
                    <p className={`mt-1 font-bold text-foreground ${isTop ? 'text-2xl' : 'text-sm'}`}>
                      ¥{product.price_cents.toLocaleString()}
                    </p>
                    {product.premium_only && (
                      <div className="mt-2">
                        <PremiumOnlyBadge />
                      </div>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
          <div className="mt-8 text-center">
            <Link
              href="/quiz"
              className="text-sm text-gray-500 underline transition-colors hover:text-primary dark:text-gray-400"
            >
              もう一度診断する
            </Link>
          </div>
        </>
      )}
    </main>
  )
}
