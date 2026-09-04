import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createCoupon, deactivateCoupon } from './actions'
import SubmitButton from '@/app/components/SubmitButton'

type CouponRow = {
  id: string
  code: string
  discount_percent: number
  expires_at: string | null
  active: boolean
  usage_limit: number | null
  used_count: number
}

// 管理者向けクーポン管理ページ（作成 + 無効化）。
// app_metadata.role のチェックはUI表示上の防御多層化に過ぎず、
// 実際の書き込み制御はDB側のRLS（coupons_write_admin_only, is_admin()ゲート）が担う。
// クーポンの再有効化経路は提供しない（deactivate_couponは冪等な片方向操作）。
export default async function AdminCouponsPage() {
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

  const { data: coupons, error } = await supabase
    .from('coupons')
    .select('id, code, discount_percent, expires_at, active, usage_limit, used_count')
    .order('created_at', { ascending: false })
    .returns<CouponRow[]>()

  if (error) {
    return (
      <p role="alert" className="text-danger">
        クーポン一覧の取得に失敗しました: {error.message}
      </p>
    )
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">クーポン管理</h1>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
        <h2 className="text-lg font-semibold text-foreground">新規クーポンを作成</h2>
        <form action={createCoupon} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            クーポンコード
            <input
              type="text"
              name="code"
              required
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            割引率（%）
            <input
              type="number"
              name="discount_percent"
              min={1}
              max={100}
              step={1}
              required
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            有効期限（任意）
            <input
              type="datetime-local"
              name="expires_at"
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            利用回数上限（任意）
            <input
              type="number"
              name="usage_limit"
              min={1}
              step={1}
              placeholder="無制限"
              className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700"
            />
          </label>
          <div className="sm:col-span-2">
            <SubmitButton className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60">
              クーポンを作成
            </SubmitButton>
          </div>
        </form>
      </section>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-surface shadow-sm dark:border-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-6 py-3 font-medium">コード</th>
              <th className="px-6 py-3 font-medium">割引率</th>
              <th className="px-6 py-3 font-medium">有効期限</th>
              <th className="px-6 py-3 font-medium">利用回数上限</th>
              <th className="px-6 py-3 font-medium">使用回数</th>
              <th className="px-6 py-3 font-medium">状態</th>
              <th className="px-6 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {coupons?.map((coupon) => (
              <tr key={coupon.id}>
                <td className="px-6 py-4 font-mono text-xs">{coupon.code}</td>
                <td className="px-6 py-4">{coupon.discount_percent}%</td>
                <td className="px-6 py-4">
                  {coupon.expires_at
                    ? new Date(coupon.expires_at).toLocaleString('ja-JP')
                    : '無期限'}
                </td>
                <td className="px-6 py-4">{coupon.usage_limit ?? '無制限'}</td>
                <td className="px-6 py-4">{coupon.used_count}</td>
                <td className="px-6 py-4">
                  {coupon.active ? (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                      有効
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      無効
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {coupon.active ? (
                    <form action={deactivateCoupon}>
                      <input type="hidden" name="couponId" value={coupon.id} />
                      <SubmitButton
                        spinnerSize="sm"
                        className="rounded-full border border-danger px-3 py-1 text-xs font-medium text-danger transition-opacity hover:opacity-80 disabled:opacity-60"
                      >
                        無効化
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
