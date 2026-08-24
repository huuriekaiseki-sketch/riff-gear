// 管理画面の売上ダッシュボード(Issue #82)。
// - DBアクセス(RPC呼び出し)はapp/admin/dashboard/page.tsx側で行い、
//   ここでは戻り値の型定義と集計・整形の純関数だけを置く
//   (lib/product-sort.ts・lib/quiz.tsの粒度・スタイルに合わせている)。
// - 「売上」の定義はorders.statusが'cancelled'以外の注文を全て集計対象とする
//   (payment_statusは問わない)。既存の人気順集計RPC get_product_sales_counts()
//   (0021_product_sales_counts.sql)と同じ思想。
// - サマリー(総売上・総注文数・平均注文額)は get_daily_sales() が返す期間
//   (直近30日)の集計から計算する。日別売上チャートと同じRPC結果を再利用する
//   ことで、ダッシュボード表示のために追加のRPC呼び出しを増やさない設計にしている
//   (表示される「総売上」は全期間ではなく直近30日間である点に注意)。
// - DB側は新規security definer RPC get_daily_sales(days) / get_product_sales_summary() を
//   supabase/migrations/0023_sales_dashboard.sqlで実装済み(implementer-db担当)。
//   実際の戻り値スキーマ:
//     get_daily_sales(days integer)
//       returns table (sales_date date, total_cents bigint, order_count bigint)
//     get_product_sales_summary()
//       returns table (product_id uuid, product_name text, sales_count bigint, total_cents bigint)
//   いずれも管理者専用データのため、関数内でis_admin()チェックを行い、
//   非管理者からの呼び出しはexceptionで拒否する設計になっている
//   (0021のget_product_sales_counts()との違い: あちらは公開集計でanonにもgrantしているが、
//   今回は売上額という機密データのためadmin以外への公開は不可)。
//   本ファイルの型定義はこの実カラム名(sales_date / sales_count)に合わせている。

// get_daily_sales(days) RPCの戻り値1行分の型。
// 列名はsupabase/migrations/0023_sales_dashboard.sqlのreturns table定義(sales_date)に合わせる。
export interface DailySalesRow {
  sales_date: string // 'YYYY-MM-DD' (date型をPostgRESTがstringで返す)
  total_cents: number
  order_count: number
}

// get_product_sales_summary() RPCの戻り値1行分の型。
// 列名はsupabase/migrations/0023_sales_dashboard.sqlのreturns table定義(sales_count)に合わせる。
export interface ProductSalesSummaryRow {
  product_id: string
  product_name: string
  sales_count: number
  total_cents: number
}

export interface SalesSummary {
  totalCents: number
  orderCount: number
  averageOrderCents: number
}

// タイムゾーンに関する既知の仕様(意図的にUTC集計のままにしている):
// - RPC側のsales_dateはcreated_atのUTC日付(created_at::date)で集計される。
// - 一方toDailySalesChartData()の日付キーはサーバーのローカルタイムゾーンで生成される。
// - そのためJST 00:00〜09:00の注文は「UTC上の前日」のバケットに計上され、
//   日別の見え方が体感とずれることがある(日合計の総和は変わらない)。
// - JST基準の集計に厳密化する場合はRPC側を (created_at at time zone 'Asia/Tokyo')::date
//   に変更し、このコメントと合わせて更新すること。

// get_daily_sales()の結果から総売上・総注文数・平均注文額を計算する純関数。
// 注文が0件の場合、平均注文額は0除算を避けて0にする。
export function calculateSalesSummary(rows: DailySalesRow[]): SalesSummary {
  const totalCents = rows.reduce((sum, r) => sum + r.total_cents, 0)
  const orderCount = rows.reduce((sum, r) => sum + r.order_count, 0)
  const averageOrderCents = orderCount === 0 ? 0 : Math.round(totalCents / orderCount)
  return { totalCents, orderCount, averageOrderCents }
}

// 日別売上バーチャート1本分の表示用データ。
export interface DailySalesChartPoint {
  date: string // 'YYYY-MM-DD'
  totalCents: number
  orderCount: number
}

// get_daily_sales()の戻り値(売上が発生した日のみの行)を受け取り、
// 直近days日分の連続した日付系列に整形する純関数。
// RPCは売上が0件の日を返さないため、ここで欠損日を0円で埋めて日付順に並べる。
// today引数はテストで日付を固定できるようにするため
// (Date.now()に依存すると実行日によってテスト結果が変わってしまう)。
// 呼び出し側(page.tsx)はdays/todayを省略してデフォルト(直近30日・現在時刻)で呼ぶ。
export function toDailySalesChartData(
  rows: DailySalesRow[],
  days: number = 30,
  today: Date = new Date(),
): DailySalesChartPoint[] {
  const rowByDate = new Map(rows.map((r) => [r.sales_date, r]))

  const series: DailySalesChartPoint[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateKey = toDateKey(d)
    const row = rowByDate.get(dateKey)
    series.push({
      date: dateKey,
      totalCents: row?.total_cents ?? 0,
      orderCount: row?.order_count ?? 0,
    })
  }

  return series
}

function toDateKey(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// get_product_sales_summary()は既にDB側でtotal_cents降順ソート済みだが、
// 呼び出し側(UI)がその前提に依存せずに済むよう、表示直前にも明示的にソートし直す純関数。
// (RPCの実装が将来変わってもUI側の並び順が壊れないようにする防御)。
export function sortProductSalesByRevenue(rows: ProductSalesSummaryRow[]): ProductSalesSummaryRow[] {
  return [...rows].sort((a, b) => {
    const diff = b.total_cents - a.total_cents
    if (diff !== 0) return diff
    return a.product_name.localeCompare(b.product_name, 'ja')
  })
}
