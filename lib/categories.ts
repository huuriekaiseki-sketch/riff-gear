// カテゴリの表示名・アクセントカラー・代表写真の定義。
// 商品一覧(app/page.tsx)・商品カード(app/ProductCard.tsx)・商品詳細ページ・
// 最近見た商品の4箇所で同じ見た目を保つため、1箇所に集約している。
export const CATEGORIES = ['guitar', 'keyboard', 'accessory'] as const

export const CATEGORY_LABEL: Record<string, string> = {
  guitar: 'ギター',
  keyboard: 'キーボード',
  accessory: 'アクセサリー',
}

// カテゴリごとのアクセントカラー(グラデーション、バッジ用)と代表写真。
// 商品ごとの実写真は持たないため、Unsplashのライセンスフリー写真(商用利用可・
// クレジット表記不要)をカテゴリの「顔」代わりに使う。特定ブランドの商品写真では
// なく、カテゴリを象徴する汎用的な一枚を採用している。
export const CATEGORY_STYLE: Record<string, { gradient: string; photoUrl: string }> = {
  guitar: {
    gradient: 'from-amber-400 via-orange-400 to-rose-400',
    photoUrl: 'https://images.unsplash.com/photo-1520985878371-887e7b0553c5?auto=format&fit=crop&w=800&q=80',
  },
  keyboard: {
    gradient: 'from-indigo-400 via-purple-400 to-fuchsia-400',
    photoUrl: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?auto=format&fit=crop&w=800&q=80',
  },
  accessory: {
    gradient: 'from-teal-400 via-cyan-400 to-sky-400',
    photoUrl: 'https://images.unsplash.com/photo-1527865118650-b28bc059d09a?auto=format&fit=crop&w=800&q=80',
  },
}

export const DEFAULT_STYLE = {
  gradient: 'from-gray-300 via-gray-400 to-gray-500',
  photoUrl: 'https://images.unsplash.com/photo-1520985878371-887e7b0553c5?auto=format&fit=crop&w=800&q=80',
}
