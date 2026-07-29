'use server'

// カート追加サーバーアクションのスタブ。
// Task 16 で実際のカート永続化ロジックを実装する。ここではページのコンパイルを通すためだけの仮実装。
export async function addToCart(formData: FormData) {
  console.log('addToCart called with', formData.get('productId'))
}
