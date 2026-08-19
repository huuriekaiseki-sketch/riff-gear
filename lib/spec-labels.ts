// 商品仕様(products.specs)のキー→日本語表示ラベル。
// カテゴリによってキーが異なるため、商品詳細ページと比較ページの両方で共有する。
export const SPEC_LABEL: Record<string, string> = {
  pickup: 'ピックアップ',
  keys: '鍵盤数',
  material: '素材',
  weight_kg: '重量',
}

export function formatSpecValue(key: string, value: unknown): string {
  if (key === 'weight_kg' && typeof value === 'number') return `${value}kg`
  return String(value)
}
