// 商品比較(issue #18)の選択状態。ログイン不要で使えるよう、DBではなく
// ブラウザのlocalStorageに保持する。仕様項目がカテゴリごとに違うため、
// 異なるカテゴリの商品を混ぜて比較できないようにcategoryを状態に持たせる。

export type CompareState = { category: string; ids: string[] } | null

const STORAGE_KEY = 'riff-gear:compare'
// 同一タブ内での変更をuseSyncExternalStoreに伝えるためのカスタムイベント。
// 'storage'イベントは別タブでの変更にしか発火しないため併用する。
const CHANGE_EVENT = 'riff-gear:compare-changed'

export const MAX_COMPARE = 3

function parseState(raw: string | null): CompareState {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as CompareState)?.category !== 'string' ||
      !Array.isArray((parsed as { ids?: unknown }).ids)
    ) {
      return null
    }
    const ids = (parsed as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string')
    return ids.length === 0 ? null : { category: (parsed as { category: string }).category, ids }
  } catch {
    return null
  }
}

// トグル処理の純関数。
// - 選択済みなら外す
// - 別カテゴリの商品は無視する(現在の選択を維持)
// - 上限に達している場合は無視する
export function toggleCompare(
  state: CompareState,
  product: { id: string; category: string },
  max: number = MAX_COMPARE
): CompareState {
  if (state?.ids.includes(product.id)) {
    const ids = state.ids.filter((id) => id !== product.id)
    return ids.length === 0 ? null : { category: state.category, ids }
  }
  if (state && state.category !== product.category) return state
  if (state && state.ids.length >= max) return state
  return { category: product.category, ids: [...(state?.ids ?? []), product.id] }
}

function loadCompare(): CompareState {
  if (typeof window === 'undefined') return null
  try {
    return parseState(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

function saveCompare(state: CompareState): void {
  if (typeof window === 'undefined') return
  try {
    if (state) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // 保存できなくても比較選択自体には影響させない
  }
}

// 商品の比較選択をオン/オフする(UIから呼ぶ副作用込みの関数)。
export function updateCompare(product: { id: string; category: string }): void {
  saveCompare(toggleCompare(loadCompare(), product))
}

export function clearCompare(): void {
  saveCompare(null)
}

// --- useSyncExternalStore用のストアAPI ---

const EMPTY: CompareState = null
let snapshotRaw: string | null = null
let snapshotState: CompareState = EMPTY

export function subscribeCompare(callback: () => void): () => void {
  window.addEventListener('storage', callback)
  window.addEventListener(CHANGE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(CHANGE_EVENT, callback)
  }
}

export function getCompareSnapshot(): CompareState {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    raw = null
  }
  if (raw !== snapshotRaw) {
    snapshotRaw = raw
    snapshotState = parseState(raw)
  }
  return snapshotState
}

// SSR時は未選択として描画する(hydration不一致を避ける)
export function getServerSnapshot(): CompareState {
  return EMPTY
}
