// 「最近見た商品」の閲覧履歴。ログイン不要で使えるよう、DBではなく
// ブラウザのlocalStorageに保存する(端末ごとの履歴で十分な機能のため)。
// 履歴の並べ替え・重複排除・件数制限は純関数(pushViewed)に切り出して
// localStorage無しの環境(SSR・テスト)でも安全に扱えるようにしている。

export type RecentlyViewedItem = {
  id: string
  name: string
  category: string
  price_cents: number
  viewedAt: number
}

const STORAGE_KEY = 'riff-gear:recently-viewed'

// 保存件数の上限。表示は最大4件だが、将来の表示件数変更やレコメンド(issue #27)
// への流用を見込み、少し多めに保持しておく。
export const MAX_STORED = 10

// 履歴の先頭に商品を追加した新しい配列を返す純関数。
// 同じ商品を見直した場合は先頭に移動し(重複排除)、上限を超えた分は末尾から捨てる。
export function pushViewed(
  history: RecentlyViewedItem[],
  item: RecentlyViewedItem,
  max: number = MAX_STORED
): RecentlyViewedItem[] {
  const withoutItem = history.filter((h) => h.id !== item.id)
  return [item, ...withoutItem].slice(0, max)
}

// localStorageから履歴を読み出す。壊れたJSONや型が合わないデータが
// 入っていた場合は空履歴として扱う(閲覧履歴は消えても実害がないため)。
export function loadRecentlyViewed(): RecentlyViewedItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (h): h is RecentlyViewedItem =>
        typeof h === 'object' &&
        h !== null &&
        typeof (h as RecentlyViewedItem).id === 'string' &&
        typeof (h as RecentlyViewedItem).name === 'string' &&
        typeof (h as RecentlyViewedItem).category === 'string' &&
        typeof (h as RecentlyViewedItem).price_cents === 'number' &&
        typeof (h as RecentlyViewedItem).viewedAt === 'number'
    )
  } catch {
    return []
  }
}

// 商品閲覧を履歴に記録する。プライベートブラウジング等でlocalStorageが
// 使えない環境では黙って何もしない(履歴はあくまで補助機能のため)。
export function recordView(item: Omit<RecentlyViewedItem, 'viewedAt'>): void {
  if (typeof window === 'undefined') return
  try {
    const next = pushViewed(loadRecentlyViewed(), { ...item, viewedAt: Date.now() })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 保存できなくても閲覧自体には影響させない
  }
}
