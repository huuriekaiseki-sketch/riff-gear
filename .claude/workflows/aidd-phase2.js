export const meta = {
  name: 'aidd-phase2',
  description: '実装フェーズ: 影響レイヤー(db/data/ui)を並列実装(リスク自己申告つき) → integratorで統合(build/test/lint/typecheck) → 5観点並列レビュー(正しさ/仕様網羅/重複・過剰実装/型安全/テスト選択)、fail時は最大N回差し戻し',
  whenToUse: 'Phase1調査(aidd-phase1-router)と設計方針の確認が終わり、実装に入る段階で使う。SPEC.mdは前提にせず、taskDescriptionと影響レイヤー(layers)を直接渡す。仕様段階でテスト種別を指定した場合はspecTestsで渡す(実装時のリスク自己申告から導いた種別との和集合が必須になる)。',
  phases: [
    { title: 'Implement', detail: '影響レイヤー(db/data/ui)を並列実装 + リスク自己申告' },
    { title: 'Integrate', detail: '結線・build/test/lint/typecheckで統合確認' },
    { title: 'Review', detail: '5観点(正しさ/仕様網羅/重複・過剰実装/型安全/テスト選択)を並列レビュー' },
  ],
}

// args: {
//   taskDescription: string,
//   layers?: ('db'|'data'|'ui')[],
//   maxReviewRetries?: number,
//   specTests?: string[],
// }
// layers: 実装が必要なレイヤー。省略時は db/data/ui の3体すべてを起動する
//   （呼び出し側がPhase1のfindingsやタスク内容から影響レイヤーを絞れる場合は指定した方が無駄が無い）
// specTests: 仕様段階(Phase1/SPEC相当)で先に指定したテスト種別キー(TEST_TYPESのキー)。
//   実装時のリスク自己申告・パス判定から導いた種別との「和集合」が必須になる
//   （仕様段階の見落としも実装時の見落としも互いに補うため。過剰になった分は
//   レビューアが「既存テストでカバー済み」等の根拠つきで免除できる）。

// ============ 変更レイヤー→テスト選択の対応表（正本） ============
// 解説と対応表の写しは docs/agents/layer-test-selection.md にあるが、機械判定の正本はこの定数。
// established: tests/配下にテスト基盤が整備済みの種別。必須(required)になり得て、無いとレビューfail。
// established=false の種別は基盤が整備されるまで「推奨」(recommended)に自動降格し、fail要因にしない。
// 基盤を整備したら established を true に昇格させ、docs側の写しも更新すること。
// 静的3種([静的]typecheck/[静的]lint/[build]production build)はintegratorが毎回実行するため、ここには含めない。
const TEST_TYPES = {
  unit: { label: '[unit]', hint: 'tests/lib/', established: true },
  property: { label: '[property]', hint: 'tests/invariants/', established: true },
  db_constraint: { label: '[DB制約]', hint: 'tests/constraints/', established: true },
  rls: { label: '[RLS]', hint: 'tests/rls/', established: true },
  rpc: { label: '[RPC統合]', hint: 'tests/rpc/', established: true },
  transaction: { label: '[transaction]', hint: 'tests/fault-injection/ または tests/rpc/', established: true },
  idempotency: { label: '[idempotency]', hint: 'tests/idempotency/', established: true },
  concurrency: { label: '[concurrency]', hint: 'tests/concurrency/（分離レベルは tests/isolation/）', established: true },
  fault: { label: '[fault]', hint: 'tests/fault-injection/', established: true },
  migration: { label: '[migration]', hint: '(基盤未整備)', established: false },
  api_integration: { label: '[API統合]', hint: '(基盤未整備)', established: false },
  contract: { label: '[契約]', hint: '(基盤未整備)', established: false },
  ui: { label: '[UI]', hint: '(基盤未整備)', established: false },
  a11y: { label: '[a11y]', hint: '(基盤未整備)', established: false },
  e2e: { label: '[E2E]', hint: '(基盤未整備)', established: false },
  privacy: { label: '[privacy]', hint: '(基盤未整備)', established: false },
}

// 実装者が自己申告するリスク性質。ファイルパスからは読み取れない意味的リスクだけを列挙する
// （変更レイヤー自体はchangedFilesのパスから機械判定するので申告不要）。
const RISK_RULES = {
  schema_change: { description: 'テーブル・カラム・CHECK・UNIQUE・FK・NOT NULLの追加/変更', tests: ['db_constraint', 'migration'] },
  authz_change: { description: 'RLSポリシー・GRANT・ロール・閲覧範囲の変更', tests: ['rls'] },
  rpc_change: { description: 'RPC関数・トリガーの追加/変更', tests: ['rpc'] },
  atomicity: { description: '複数テーブル・複数行を1つの業務処理として更新する（全成功or全失敗が必要）', tests: ['transaction'] },
  retry_possible: { description: '二重クリック・再送・再実行があり得る処理（注文・決済・Webhook・取消）', tests: ['idempotency'] },
  contention: { description: '在庫・予約・残高・利用上限など同時実行の競合があり得る', tests: ['concurrency'] },
  external_api: { description: '決済・メール・配送など外部APIの呼び出しを追加/変更した', tests: ['fault'] },
  complex_logic: { description: '入力パターン・操作順が多い計算/状態遷移を追加/変更した', tests: ['property'] },
  personal_data: { description: '個人情報・CSV出力・ログ出力に関わる変更をした', tests: ['privacy'] },
}

const DB_RISK_KEYS = ['schema_change', 'authz_change', 'rpc_change']

function normalizePath(filePath) {
  return String(filePath).toLowerCase().replace(/\\/g, '/').replace(/^\.\//, '')
}

// changedFilesのパス + リスク自己申告 + 仕様段階指定(specTests)から、必須/推奨テスト種別を機械的に導く。
// レビューアには「何のテストが必要か」を判断させず、この結果の存在確認だけをさせる
// （抽象的な「テスト網羅性を見て」指示だと判断がぶれるため）。
function deriveTestSelection(changedFiles, risks, specTests) {
  const required = new Set()
  const recommended = new Set()
  const notes = []
  const unknownSpecTests = []

  const paths = (changedFiles ?? []).map(normalizePath)
  const nonTestPaths = paths.filter((p) => !p.startsWith('tests/'))

  // 1. パスからの機械判定（変更レイヤー基準）
  if (nonTestPaths.some((p) => p.startsWith('supabase/migrations/'))) {
    recommended.add('migration')
    if (!(risks ?? []).some((r) => DB_RISK_KEYS.includes(r))) {
      notes.push(
        'supabase/migrations/ の変更があるのに schema_change/authz_change/rpc_change のいずれも申告されていない。申告漏れの可能性が高いのでdiffと突き合わせ、未申告リスクに対応するテストも無ければfailにすること'
      )
    }
  }
  if (nonTestPaths.some((p) => p.startsWith('lib/') && /\.(ts|tsx)$/.test(p))) {
    required.add('unit')
  }
  if (nonTestPaths.some((p) => p.startsWith('app/api/') || p.endsWith('/route.ts') || p.endsWith('/actions.ts'))) {
    recommended.add('api_integration')
    recommended.add('contract')
  }
  if (nonTestPaths.some((p) => p.startsWith('app/') && p.endsWith('.tsx'))) {
    recommended.add('ui')
    recommended.add('a11y')
  }

  // 2. リスク自己申告からの機械判定
  for (const risk of risks ?? []) {
    const rule = RISK_RULES[risk]
    if (!rule) continue // スキーマのenumで弾かれる想定だが安全側に無視
    for (const t of rule.tests) required.add(t)
  }

  // 3. 仕様段階指定との和集合
  for (const t of specTests ?? []) {
    if (TEST_TYPES[t]) required.add(t)
    else unknownSpecTests.push(t)
  }
  if (unknownSpecTests.length > 0) {
    notes.push(`specTestsに未知のテスト種別キーが指定された: ${unknownSpecTests.join(', ')}（TEST_TYPESのキーを使うこと）`)
  }

  // 4. 基盤未整備の種別はfail要因にしない: requiredからrecommendedへ自動降格
  for (const t of [...required]) {
    if (!TEST_TYPES[t].established) {
      required.delete(t)
      recommended.add(t)
    }
  }
  for (const t of required) recommended.delete(t)

  return { required: [...required], recommended: [...recommended], notes }
}

function formatTestTypes(keys) {
  if (keys.length === 0) return '(なし)'
  return keys.map((k) => `- ${TEST_TYPES[k].label} (キー: ${k}, 置き場所: ${TEST_TYPES[k].hint})`).join('\n')
}

const RISK_REPORT_GUIDE = `

## リスク自己申告（risksフィールド・必須）
今回の実装に当てはまるリスク性質をすべて risks に列挙すること。該当が無ければ空配列を返す。
過少申告するとレビューで必要テストの検証が漏れるため、迷ったら申告する:
${Object.entries(RISK_RULES)
  .map(([key, r]) => `- ${key}: ${r.description}`)
  .join('\n')}`

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pass', 'blocked'] },
    detail: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string', enum: Object.keys(RISK_RULES) } },
  },
  required: ['status', 'detail', 'changedFiles', 'risks'],
}
const INTEGRATE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pass', 'blocked'] },
    detail: { type: 'string' },
  },
  required: ['status', 'detail'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pass', 'fail'] },
    detail: { type: 'string' },
  },
  required: ['status', 'detail'],
}

const LAYER_AGENT = { db: 'implementer-db', data: 'implementer-data', ui: 'implementer-ui' }
const REVIEW_FOCUSES = [
  { key: 'correctness', label: '正しさ' },
  { key: 'coverage', label: '仕様網羅' },
  { key: 'overengineering', label: '重複・過剰実装' },
  { key: 'typesafety', label: '型安全' },
  { key: 'testselection', label: 'テスト選択' },
]

function describeResult(result) {
  if (result === null) return '(実行失敗: エージェントが結果を返しませんでした)'
  return result.detail ?? '(detail無し)'
}

function buildReviewPrompt(focus, taskDescription, changedFiles, risks, testSelection) {
  const base = `タスク: ${taskDescription}\n\n変更ファイル一覧:\n${changedFiles.join('\n') || '(無し)'}\n\nレビュー観点: ${focus.label}のみを検証すること`
  if (focus.key !== 'testselection') return base
  return `${base}

## テスト選択の検証データ（機械導出済み。何のテストが必要かをゼロから判断し直さないこと）
実装者が申告したリスク: ${risks.join(', ') || '(なし)'}

必須テスト種別（今回の変更に対応するテストが無ければfail）:
${formatTestTypes(testSelection.required)}

推奨テスト種別（無くてもfailにしない。detailに指摘として書くのみ）:
${formatTestTypes(testSelection.recommended)}

整合性チェックの注意:
${testSelection.notes.map((n) => `- ${n}`).join('\n') || '(なし)'}`
}

async function runImplementLayers(taskDescription, layers, extraContext, labelSuffix) {
  const prompt = `タスク: ${taskDescription}${extraContext}${RISK_REPORT_GUIDE}`
  return parallel(
    layers.map((layer) => () =>
      agent(`${prompt}\n\n担当レイヤー: ${layer}`, {
        label: `implementer-${layer}${labelSuffix}`,
        agentType: LAYER_AGENT[layer],
        phase: 'Implement',
        schema: IMPLEMENT_SCHEMA,
      })
    )
  )
}

async function runIntegrate(taskDescription, implementResults, layers, changedFiles, labelSuffix) {
  const summary = implementResults.map((r, i) => `- ${layers[i]}: ${describeResult(r)}`).join('\n')
  return agent(
    `タスク: ${taskDescription}\n\n各レイヤーの実装報告:\n${summary}\n\n変更ファイル一覧:\n${changedFiles.join('\n') || '(無し)'}`,
    { label: `integrator${labelSuffix}`, agentType: 'integrator', phase: 'Integrate', schema: INTEGRATE_SCHEMA }
  )
}

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const taskDescription = parsedArgs?.taskDescription
if (!taskDescription) {
  throw new Error('taskDescriptionが必須です')
}
const layers = parsedArgs?.layers ?? ['db', 'data', 'ui']
const maxReviewRetries = parsedArgs?.maxReviewRetries ?? 3
const specTests = parsedArgs?.specTests ?? []

phase('Implement')
log(`実装レイヤー: ${layers.join(', ')}`)
const implementResults = await runImplementLayers(taskDescription, layers, '', '')

const blockedLayers = layers.filter((_, i) => implementResults[i] === null || implementResults[i]?.status === 'blocked')
if (blockedLayers.length > 0) {
  return {
    route: 'aidd-phase2-blocked',
    stage: 'implement',
    result: {
      blockedLayers,
      detail: implementResults.map((r, i) => `${layers[i]}: ${describeResult(r)}`),
    },
  }
}

let changedFiles = implementResults.flatMap((r) => r?.changedFiles ?? [])
let allRisks = [...new Set(implementResults.flatMap((r) => r?.risks ?? []))]

phase('Integrate')
let integrateResult = await runIntegrate(taskDescription, implementResults, layers, changedFiles, '')
if (!integrateResult || integrateResult.status !== 'pass') {
  return {
    route: 'aidd-phase2-blocked',
    stage: 'integrate',
    result: { detail: describeResult(integrateResult) },
  }
}

let retry = 0
while (true) {
  phase('Review')
  // 差し戻しでchangedFiles/risksが増え得るため、テスト選択はレビューのたびに導出し直す
  const testSelection = deriveTestSelection(changedFiles, allRisks, specTests)
  log(
    `レビュー実行(試行 ${retry + 1}/${maxReviewRetries + 1}) 必須テスト: ${testSelection.required.join(', ') || 'なし'} / 推奨: ${testSelection.recommended.join(', ') || 'なし'}`
  )
  const reviewResults = await parallel(
    REVIEW_FOCUSES.map((f) => () =>
      agent(buildReviewPrompt(f, taskDescription, changedFiles, allRisks, testSelection), {
        label: `reviewer-${f.key}`,
        agentType: 'reviewer',
        phase: 'Review',
        schema: REVIEW_SCHEMA,
      })
    )
  )

  const failedFocuses = REVIEW_FOCUSES.filter((_, i) => reviewResults[i] === null || reviewResults[i]?.status !== 'pass')
  if (failedFocuses.length === 0) {
    return {
      route: 'aidd-phase2-pass',
      result: {
        detail: 'レビュー全観点pass',
        changedFiles,
        retries: retry,
        testSelection: { ...testSelection, risks: allRisks },
      },
    }
  }

  if (retry >= maxReviewRetries) {
    return {
      route: 'aidd-phase2-blocked',
      stage: 'review',
      result: {
        detail: failedFocuses.map((f) => {
          const i = REVIEW_FOCUSES.indexOf(f)
          return `${f.label}: ${describeResult(reviewResults[i])}`
        }),
        retries: retry,
      },
    }
  }

  retry++
  const fixNote = failedFocuses
    .map((f) => {
      const i = REVIEW_FOCUSES.indexOf(f)
      return `- ${f.label}: ${describeResult(reviewResults[i])}`
    })
    .join('\n')
  log(`レビュー指摘あり(${failedFocuses.map((f) => f.label).join('、')})。実装へ差し戻し(${retry}/${maxReviewRetries})`)

  phase('Implement')
  const fixContext = `\n\n## レビュー指摘（修正すること）\n${fixNote}`
  const fixResults = await runImplementLayers(taskDescription, layers, fixContext, `-fix${retry}`)
  const stillBlocked = layers.filter((_, i) => fixResults[i] === null || fixResults[i]?.status === 'blocked')
  if (stillBlocked.length > 0) {
    return {
      route: 'aidd-phase2-blocked',
      stage: 'implement',
      result: {
        blockedLayers: stillBlocked,
        detail: fixResults.map((r, i) => `${layers[i]}: ${describeResult(r)}`),
        retries: retry,
      },
    }
  }
  changedFiles = [...new Set([...changedFiles, ...fixResults.flatMap((r) => r?.changedFiles ?? [])])]
  allRisks = [...new Set([...allRisks, ...fixResults.flatMap((r) => r?.risks ?? [])])]

  phase('Integrate')
  integrateResult = await runIntegrate(taskDescription, fixResults, layers, changedFiles, `-retry${retry}`)
  if (!integrateResult || integrateResult.status !== 'pass') {
    return {
      route: 'aidd-phase2-blocked',
      stage: 'integrate',
      result: { detail: describeResult(integrateResult), retries: retry },
    }
  }
}
