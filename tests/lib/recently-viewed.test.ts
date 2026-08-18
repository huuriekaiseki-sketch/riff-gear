import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  pushViewed,
  loadRecentlyViewed,
  recordView,
  getRecentlyViewedSnapshot,
  getServerSnapshot,
  MAX_STORED,
  type RecentlyViewedItem,
} from '@/lib/recently-viewed'

function makeItem(id: string, viewedAt = 0): RecentlyViewedItem {
  return { id, name: `商品${id}`, category: 'guitar', price_cents: 1000, viewedAt }
}

// window/localStorageを持つ最小限の環境を偽装する。
// Node環境のvitestではwindowが無いので、テストごとにstubして復元する。
function stubWindowWithStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  }
  vi.stubGlobal('window', { localStorage })
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pushViewed', () => {
  it('新しい商品を先頭に追加する', () => {
    const history = [makeItem('a')]
    const next = pushViewed(history, makeItem('b'))
    expect(next.map((h) => h.id)).toEqual(['b', 'a'])
  })

  it('同じ商品を見直すと先頭に移動し重複しない', () => {
    const history = [makeItem('a'), makeItem('b')]
    const next = pushViewed(history, makeItem('b', 100))
    expect(next.map((h) => h.id)).toEqual(['b', 'a'])
    expect(next[0].viewedAt).toBe(100)
  })

  it('上限を超えた分は末尾から捨てられる', () => {
    const history = Array.from({ length: MAX_STORED }, (_, i) => makeItem(`p${i}`))
    const next = pushViewed(history, makeItem('new'))
    expect(next).toHaveLength(MAX_STORED)
    expect(next[0].id).toBe('new')
    expect(next.some((h) => h.id === `p${MAX_STORED - 1}`)).toBe(false)
  })

  it('元の配列を破壊しない', () => {
    const history = [makeItem('a')]
    pushViewed(history, makeItem('b'))
    expect(history.map((h) => h.id)).toEqual(['a'])
  })
})

describe('loadRecentlyViewed', () => {
  it('windowが無い環境(SSR)では空配列を返す', () => {
    expect(loadRecentlyViewed()).toEqual([])
  })

  it('保存済みの履歴を読み出せる', () => {
    stubWindowWithStorage({
      'riff-gear:recently-viewed': JSON.stringify([makeItem('a', 10)]),
    })
    expect(loadRecentlyViewed()).toEqual([makeItem('a', 10)])
  })

  it('壊れたJSONは空履歴として扱う', () => {
    stubWindowWithStorage({ 'riff-gear:recently-viewed': '{broken' })
    expect(loadRecentlyViewed()).toEqual([])
  })

  it('型が合わない要素は除外する', () => {
    stubWindowWithStorage({
      'riff-gear:recently-viewed': JSON.stringify([makeItem('a'), { id: 123 }, 'x']),
    })
    expect(loadRecentlyViewed().map((h) => h.id)).toEqual(['a'])
  })
})

describe('recordView', () => {
  it('閲覧をlocalStorageに保存する', () => {
    const store = stubWindowWithStorage()
    recordView({ id: 'a', name: '商品a', category: 'guitar', price_cents: 1000 })
    const saved = JSON.parse(store.get('riff-gear:recently-viewed') ?? '[]')
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe('a')
    expect(typeof saved[0].viewedAt).toBe('number')
  })

  it('localStorageが例外を投げても失敗しない', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('storage disabled')
        },
        setItem: () => {
          throw new Error('storage disabled')
        },
      },
    })
    expect(() =>
      recordView({ id: 'a', name: '商品a', category: 'guitar', price_cents: 1000 })
    ).not.toThrow()
  })
})

describe('getRecentlyViewedSnapshot', () => {
  it('保存内容が変わらない間は同一参照を返す(useSyncExternalStoreの要件)', () => {
    stubWindowWithStorage({
      'riff-gear:recently-viewed': JSON.stringify([makeItem('a', 10)]),
    })
    const first = getRecentlyViewedSnapshot()
    const second = getRecentlyViewedSnapshot()
    expect(second).toBe(first)
    expect(first.map((h) => h.id)).toEqual(['a'])
  })

  it('recordView後は新しい履歴を返す', () => {
    stubWindowWithStorage({
      'riff-gear:recently-viewed': JSON.stringify([makeItem('a', 10)]),
    })
    const before = getRecentlyViewedSnapshot()
    recordView({ id: 'b', name: '商品b', category: 'keyboard', price_cents: 2000 })
    const after = getRecentlyViewedSnapshot()
    expect(after).not.toBe(before)
    expect(after.map((h) => h.id)).toEqual(['b', 'a'])
  })

  it('getServerSnapshotは常に空配列(同一参照)を返す', () => {
    expect(getServerSnapshot()).toBe(getServerSnapshot())
    expect(getServerSnapshot()).toEqual([])
  })
})
