import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  calculateSalesSummary,
  resolveDashboardViewState,
  sortProductSalesByRevenue,
  toDailySalesChartData,
  type DailySalesRow,
  type ProductSalesSummaryRow,
} from '@/lib/sales-dashboard'

const DAILY_SALES_DAYS = 30

// 管理者向け売上ダッシュボード(Issue #82)。
// app_metadata.role のチェックはUI表示上の防御多層化に過ぎず、
// 実際のアクセス制御はDB側のRLS/RPC内のis_admin()ゲートが担う(app/admin/orders/page.tsxと同じ方針)。
export default async function AdminDashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  const isAdmin = userData.user?.app_metadata?.role === 'admin'

  // 非管理者はどのみちRPC側のis_admin()チェックで拒否されるだけなので、
  // 無駄なDBラウンドトリップを避けるためisAdminがtrueのときだけRPCを呼ぶ。
  const [{ data: dailySales, error: dailySalesError }, { data: productSales, error: productSalesError }] = isAdmin
    ? await Promise.all([
        supabase.rpc('get_daily_sales', { days: DAILY_SALES_DAYS }) as unknown as Promise<{
          data: DailySalesRow[] | null
          error: { message: string } | null
        }>,
        supabase.rpc('get_product_sales_summary') as unknown as Promise<{
          data: ProductSalesSummaryRow[] | null
          error: { message: string } | null
        }>,
      ])
    : [
        { data: null, error: null } as { data: DailySalesRow[] | null; error: { message: string } | null },
        { data: null, error: null } as { data: ProductSalesSummaryRow[] | null; error: { message: string } | null },
      ]

  // 「管理者チェック→RPCエラー時→成功時」の分岐は純関数(resolveDashboardViewState)に
  // 切り出してあり、lib/sales-dashboard.test.tsで単体テストされている。
  const viewState = resolveDashboardViewState({
    isAdmin,
    dailySales,
    dailySalesError,
    productSales,
    productSalesError,
  })

  if (viewState.status === 'forbidden') {
    return (
      <p role="alert" className="text-danger">
        このページには管理者のみアクセスできます。
      </p>
    )
  }

  if (viewState.status === 'error') {
    return (
      <p role="alert" className="text-danger">
        売上データの取得に失敗しました: {viewState.message}
      </p>
    )
  }

  // 売上の定義: status='cancelled'以外の全注文を集計対象とする（get_product_sales_counts()と同じ思想）。
  // 集計自体はDB側のRPC(get_daily_sales / get_product_sales_summary)で完結しており、
  // ここではRPC結果からサマリー計算・表示用整形のみを行う。
  const summary = calculateSalesSummary(viewState.dailySales)
  const chartData = toDailySalesChartData(viewState.dailySales)
  const rankedProductSales = sortProductSalesByRevenue(viewState.productSales)
  const maxDailyTotalCents = Math.max(1, ...chartData.map((d) => d.totalCents))

  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">売上ダッシュボード</h1>

      {/* (1) サマリー */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            総売上
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            ¥{summary.totalCents.toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            総注文数
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {summary.orderCount.toLocaleString()}件
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            平均注文額
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            ¥{summary.averageOrderCents.toLocaleString()}
          </p>
        </div>
      </div>

      {/* (2) 直近30日の日別売上（CSSベースの簡易バーチャート） */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
        <h2 className="text-lg font-semibold text-foreground">直近{DAILY_SALES_DAYS}日間の日別売上</h2>
        {chartData.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">売上データがありません。</p>
        ) : (
          <div className="mt-6 flex h-48 items-end gap-1 overflow-x-auto">
            {chartData.map((day) => (
              <div
                key={day.date}
                className="group relative flex h-full min-w-[6px] flex-1 flex-col items-center justify-end"
              >
                <div
                  className="w-full rounded-t-sm bg-primary transition-opacity group-hover:opacity-80"
                  style={{
                    height: `${Math.max(2, (day.totalCents / maxDailyTotalCents) * 100)}%`,
                  }}
                />
                <span className="pointer-events-none absolute -top-8 hidden whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white group-hover:block">
                  {day.date}: ¥{day.totalCents.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* (3) 商品別売上ランキング */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-surface shadow-sm dark:border-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-6 py-3 font-medium">順位</th>
              <th className="px-6 py-3 font-medium">商品名</th>
              <th className="px-6 py-3 font-medium">販売数</th>
              <th className="px-6 py-3 font-medium">売上金額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {rankedProductSales.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  売上データがありません。
                </td>
              </tr>
            ) : (
              rankedProductSales.map((row, index) => (
                <tr key={row.product_id}>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{index + 1}</td>
                  <td className="px-6 py-4 font-medium text-foreground">{row.product_name}</td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                    {row.sales_count.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 font-medium text-foreground">
                    ¥{row.total_cents.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
