// premium_only商品に付与する「会員限定」バッジ。ReturnWarrantyBadgeと同様、
// propsを持たない静的表示コンポーネント(呼び出し側でproduct.premium_onlyが
// trueのときだけ描画する)。RLSにより非会員には元々この商品自体が
// select結果に含まれない想定だが、管理者はis_admin()経由で閲覧できるため、
// 管理者向け画面や自分が非公開設定した商品の確認用にも表示上の目印となる。
export default function PremiumOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
      <span aria-hidden>★</span>
      会員限定
    </span>
  )
}
