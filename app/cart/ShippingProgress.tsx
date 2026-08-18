import { FREE_SHIPPING_THRESHOLD_CENTS, getShippingProgress } from '@/lib/shipping'

// 送料無料ラインまでの進捗バー。表示専用で合計金額の計算には関与しない。
// 「あと¥Xで送料無料」の残額訴求は、カート単価を引き上げるECの定番UX。
export default function ShippingProgress({ totalCents }: { totalCents: number }) {
  const { isFree, remainingCents, percent } = getShippingProgress(totalCents)

  return (
    <div className="mt-4">
      {isFree ? (
        <p className="text-sm font-medium text-success">🎉 送料無料でお届けします！</p>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          あと
          <span className="mx-1 font-semibold text-primary">
            ¥{remainingCents.toLocaleString()}
          </span>
          で<span className="font-semibold">送料無料</span>
          （¥{FREE_SHIPPING_THRESHOLD_CENTS.toLocaleString()}以上）
        </p>
      )}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="送料無料ラインまでの進捗"
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
