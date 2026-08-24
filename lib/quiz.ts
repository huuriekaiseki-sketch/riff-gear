// 「あなたにぴったりの機材診断」クイズ(Issue #80)。
// - 質問定義・URLクエリのパース・結果スコアリングをすべて純関数として置く。
//   DBアクセスはapp/quiz/page.tsx側で行い、ここでは持ち込まない
//   (lib/product-sort.tsの粒度・スタイルに合わせている)。
// - DBスキーマ変更は不要。既存の人気順集計RPC get_product_sales_counts()(0021)を
//   呼び出し側でtoSalesCountMapに通した結果をそのまま受け取る想定。

export type QuizCategoryAnswer = 'guitar' | 'keyboard' | 'accessory' | 'any'
export type QuizBudgetAnswer = 'under_10000' | 'under_100000' | 'under_200000' | 'unlimited'
export type QuizFocusAnswer = 'popular' | 'beginner' | 'spec'

export interface QuizAnswers {
  category: QuizCategoryAnswer
  budget: QuizBudgetAnswer
  focus: QuizFocusAnswer
}

// 予算選択肢ごとの価格上限(price_cents)。unlimitedはInfinityで「上限なし」を表す。
const BUDGET_MAX_PRICE_CENTS: Record<QuizBudgetAnswer, number> = {
  under_10000: 10_000,
  under_100000: 100_000,
  under_200000: 200_000,
  unlimited: Infinity,
}

// 画面表示用の質問定義。UI層(QuizForm)はこの配列を1問ずつ表示するだけでよい構造にしている。
export const QUIZ_QUESTIONS = [
  {
    key: 'category' as const,
    question: '探している機材は?',
    options: [
      { value: 'guitar' as const, label: 'ギター' },
      { value: 'keyboard' as const, label: 'キーボード' },
      { value: 'accessory' as const, label: 'アクセサリー' },
      { value: 'any' as const, label: 'お任せ' },
    ],
  },
  {
    key: 'budget' as const,
    question: 'ご予算は?',
    options: [
      { value: 'under_10000' as const, label: '〜10,000円' },
      { value: 'under_100000' as const, label: '〜100,000円' },
      { value: 'under_200000' as const, label: '〜200,000円' },
      { value: 'unlimited' as const, label: '上限なし' },
    ],
  },
  {
    key: 'focus' as const,
    question: '重視するポイントは?',
    options: [
      { value: 'popular' as const, label: 'みんなの人気' },
      { value: 'beginner' as const, label: '初心者向けの扱いやすさ' },
      { value: 'spec' as const, label: '本格スペック' },
    ],
  },
] as const

const CATEGORY_VALUES: readonly QuizCategoryAnswer[] = ['guitar', 'keyboard', 'accessory', 'any']
const BUDGET_VALUES: readonly QuizBudgetAnswer[] = [
  'under_10000',
  'under_100000',
  'under_200000',
  'unlimited',
]
const FOCUS_VALUES: readonly QuizFocusAnswer[] = ['popular', 'beginner', 'spec']

// URLのsearchParamsから来る生の値(string | string[] | undefined)を検証する。
// 3問すべてが揃っていて、かついずれも既知の値でなければnullを返し、
// 呼び出し側(app/quiz/page.tsx)はnullなら質問フォームを表示する判断ができる。
export function parseQuizParams(raw: {
  category?: string
  budget?: string
  focus?: string
}): QuizAnswers | null {
  const { category, budget, focus } = raw
  if (
    category &&
    budget &&
    focus &&
    (CATEGORY_VALUES as readonly string[]).includes(category) &&
    (BUDGET_VALUES as readonly string[]).includes(budget) &&
    (FOCUS_VALUES as readonly string[]).includes(focus)
  ) {
    return {
      category: category as QuizCategoryAnswer,
      budget: budget as QuizBudgetAnswer,
      focus: focus as QuizFocusAnswer,
    }
  }
  return null
}

// scoreQuizProductsが受け取る商品の最小構造。
// productsテーブルの全カラムを持ち込む必要はないため、必要なフィールドだけの構造的型にしている。
export interface QuizProduct {
  id: string
  name: string
  category: string
  price_cents: number
  member_price_cents?: number | null
  premium_only?: boolean
  stock: number
  specs: Record<string, unknown> | null
}

// カテゴリ(anyなら絞り込みなし)と予算上限でフィルタしたうえで、
// 重視ポイント(focus)に応じたスコアで並べ替え、上位3件を返す純関数。
// 在庫の有無(stock > 0)は呼び出し側(app/quiz/page.tsx)のクエリで既に絞り込んでいる前提。
export function scoreQuizProducts(
  products: QuizProduct[],
  answers: QuizAnswers,
  salesCountByProductId: Map<string, number>,
): QuizProduct[] {
  const maxPrice = BUDGET_MAX_PRICE_CENTS[answers.budget]

  const filtered = products.filter((p) => {
    if (answers.category !== 'any' && p.category !== answers.category) return false
    return p.price_cents <= maxPrice
  })

  const scored = filtered.map((product) => ({
    product,
    score: scoreByFocus(product, answers.focus, salesCountByProductId),
  }))

  scored.sort((a, b) => {
    const diff = b.score - a.score
    if (diff !== 0) return diff
    // 同点は名前順で安定させる(表示順がフェッチのたびにばらつくのを防ぐ)。
    return a.product.name.localeCompare(b.product.name, 'ja')
  })

  return scored.slice(0, 3).map((s) => s.product)
}

function scoreByFocus(
  product: QuizProduct,
  focus: QuizFocusAnswer,
  salesCountByProductId: Map<string, number>,
): number {
  switch (focus) {
    case 'popular':
      // 「みんなの人気」は素直に販売数そのものをスコアにする。
      return salesCountByProductId.get(product.id) ?? 0

    case 'beginner': {
      // 「初心者向けの扱いやすさ」は価格の安さを主軸に置く(高額機材ほど扱いに慣れが要る想定)。
      // 価格を10万円あたり-100点になるよう線形変換し、負担感の大小を数値化する。
      const priceScore = -(product.price_cents / 100_000) * 100
      // 軽さは初心者にとって取り回しやすさの代理指標として加点する。
      // weight_kg未定義の商品(アクセサリー等)は不利にならないよう0点(中立)扱いにする。
      const weight = readWeightKg(product.specs)
      const weightScore = weight === null ? 0 : Math.max(0, 20 - weight * 2)
      return priceScore + weightScore
    }

    case 'spec': {
      // 「本格スペック」は価格の高さを上位グレードの代理指標として主軸に置く。
      const priceScore = (product.price_cents / 100_000) * 100
      // 加えて、specsに記録されている項目数が多いほど作り込みが細かい機材とみなし加点する。
      const specCount = product.specs ? Object.keys(product.specs).length : 0
      const specScore = specCount * 10
      return priceScore + specScore
    }

    default:
      return 0
  }
}

function readWeightKg(specs: Record<string, unknown> | null): number | null {
  const value = specs?.weight_kg
  return typeof value === 'number' ? value : null
}
