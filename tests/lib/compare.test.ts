import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  toggleCompare,
  updateCompare,
  clearCompare,
  getCompareSnapshot,
  getServerSnapshot,
  MAX_COMPARE,
  type CompareState,
} from '@/lib/compare'

function stubWindowWithStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const listeners: Record<string, Array<() => void>> = {}
  const window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener: (type: string, cb: () => void) => {
      listeners[type] = [...(listeners[type] ?? []), cb]
    },
    removeEventListener: () => {},
    dispatchEvent: (event: { type: string }) => {
      for (const cb of listeners[event.type] ?? []) cb()
    },
  }
  vi.stubGlobal('window', window)
  vi.stubGlobal('Event', class {
    type: string
    constructor(type: string) {
      this.type = type
    }
  })
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('toggleCompare', () => {
  it('未選択の商品を追加する', () => {
    const next = toggleCompare(null, { id: 'a', category: 'guitar' })
    expect(next).toEqual({ category: 'guitar', ids: ['a'] })
  })

  it('選択済みの商品を外す', () => {
    const state: CompareState = { category: 'guitar', ids: ['a', 'b'] }
    const next = toggleCompare(state, { id: 'a', category: 'guitar' })
    expect(next).toEqual({ category: 'guitar', ids: ['b'] })
  })

  it('最後の1件を外すとnullに戻る', () => {
    const state: CompareState = { category: 'guitar', ids: ['a'] }
    const next = toggleCompare(state, { id: 'a', category: 'guitar' })
    expect(next).toBeNull()
  })

  it('異なるカテゴリの商品は無視する', () => {
    const state: CompareState = { category: 'guitar', ids: ['a'] }
    const next = toggleCompare(state, { id: 'x', category: 'keyboard' })
    expect(next).toBe(state)
  })

  it('上限を超える追加は無視する', () => {
    const state: CompareState = { category: 'guitar', ids: ['a', 'b', 'c'] }
    const next = toggleCompare(state, { id: 'd', category: 'guitar' }, MAX_COMPARE)
    expect(next).toBe(state)
  })
})

describe('updateCompare / clearCompare', () => {
  it('選択をlocalStorageに保存する', () => {
    const store = stubWindowWithStorage()
    updateCompare({ id: 'a', category: 'guitar' })
    expect(JSON.parse(store.get('riff-gear:compare') ?? 'null')).toEqual({
      category: 'guitar',
      ids: ['a'],
    })
  })

  it('clearCompareで選択が消える', () => {
    const store = stubWindowWithStorage({
      'riff-gear:compare': JSON.stringify({ category: 'guitar', ids: ['a'] }),
    })
    clearCompare()
    expect(store.has('riff-gear:compare')).toBe(false)
  })
})

describe('getCompareSnapshot', () => {
  it('windowが無い環境(SSR)ではgetServerSnapshotがnullを返す', () => {
    expect(getServerSnapshot()).toBeNull()
  })

  it('保存内容が変わらない間は同一参照を返す(useSyncExternalStoreの要件)', () => {
    stubWindowWithStorage({
      'riff-gear:compare': JSON.stringify({ category: 'guitar', ids: ['a'] }),
    })
    const first = getCompareSnapshot()
    const second = getCompareSnapshot()
    expect(second).toBe(first)
    expect(first).toEqual({ category: 'guitar', ids: ['a'] })
  })

  it('壊れたJSONはnullとして扱う', () => {
    stubWindowWithStorage({ 'riff-gear:compare': '{broken' })
    expect(getCompareSnapshot()).toBeNull()
  })
})
