// 返品・保証ポリシーを常時表示するバッジ。このサイトにはまだポリシー規定が
// 無いため、楽器店ECの定番水準(30日以内返品可・1年保証)を文言として固定表示する。
// 商品ごとの差異は無いので、propsを持たない静的コンポーネントにしている。
export default function ReturnWarrantyBadge() {
  return (
    <ul className="flex flex-wrap gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
      <li className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-1 dark:border-gray-700">
        <span aria-hidden>↩️</span>
        30日以内返品可
      </li>
      <li className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-1 dark:border-gray-700">
        <span aria-hidden>🛡️</span>
        1年保証
      </li>
    </ul>
  )
}
