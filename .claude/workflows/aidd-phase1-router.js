export const meta = {
  name: 'aidd-phase1-router',
  description: 'taskDescriptionとchangedFiles(変更ファイル一覧)をTRI/RISK基準・メタ改修基準に照合し、aidd-phase1（Sweep調査）を起動するか、高リスクとして人間の確認を挟むかを機械的に判定する。',
  whenToUse: 'Phase 1調査の入り口として使う。マイグレーション・auth・RLS/policy等の高リスク変更、および.claude/workflows/・.claude/agents/・docs/agents/配下のみのメタ改修を機械的に判定する。呼び出し側は事前に`git diff --name-only`等で変更（予定）ファイル一覧を取得し、changedFilesとして渡すこと。',
  phases: [
    { title: 'Route', detail: 'メタ改修判定（最優先）→ ファイルパス（優先）とtaskDescriptionキーワード（補助）でリスク判定' },
    { title: 'Sweep', detail: '4軸並列Sweep（UI/データ/DB/型）' },
    { title: 'Critic', detail: '追加調査が必要か判定（Loop-Until-Dry）' },
  ],
}

// args: { taskDescription?: string, maxRounds?: number, changedFiles?: string[] }
// changedFiles: 変更対象ファイルパスの配列。Workflowスクリプト自体はgit diffを実行できない
//   （filesystem/Node.js APIアクセス無し）ため、呼び出し側（Claude Code）が
//   `git diff --name-only`や変更予定ファイルリストから取得して渡すこと。
//
// 判定優先順位:
//   1. changedFilesが全てメタ改修パス（META_PATH_PREFIXES）配下 → 最優先でmetaルート（Sweep自体を起動しない）
//   2. changedFilesが1件以上ある場合はパス一致（matchedPaths）のみでisHighRiskを判定する。
//      taskDescriptionのキーワード一致は「〜には触れない」等の否定文脈でも単純一致してしまうため、
//      変更対象ファイルが分かっている場合はそちらを信頼する。
//   3. changedFilesが空（未指定含む）の場合のみ、後方互換としてキーワード一致で判定する。
//      その場合、高リスクと判定されても自動でdeepルートには倒さず、人間確認(confirm)に回す
//      （medical-inventory-vkumaiで実際に発生した「否定文脈の誤検知で無関係な大規模調査が
//      自動起動した」事故を避けるため）。
//
// 意図的に安全側に倒す: false positive（軽微なタスクが高リスク扱いになる）は許容し、
// false negative（高リスク変更を見逃す）は許容しない。

const RISK_PATH_PREFIXES = ['supabase/migrations/', 'lib/supabase/']
const RISK_DOMAIN_KEYWORDS = ['auth', '認証', 'ログイン', 'rls', 'policy', 'ポリシー', 'grant', '権限']
const RISK_KEYWORDS = [
  'migrations', 'migration', 'マイグレーション', 'スキーマ',
  'lib/supabase', 'middleware.ts', 'ミドルウェア',
  'auth', '認証', 'ログイン',
  'rls', 'policy', 'ポリシー', 'grant', '権限',
]
// このパイプライン自体のメタ改修パス（AIDDワークフロー定義・エージェント定義・エージェント向けドキュメント）
const META_PATH_PREFIXES = ['.claude/workflows/', '.claude/agents/', 'docs/agents/']

function isHighRiskPath(filePath) {
  const normalized = String(filePath).toLowerCase().replace(/\\/g, '/')
  if (RISK_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true
  if (normalized === 'middleware.ts' || normalized.endsWith('/middleware.ts')) return true
  return RISK_DOMAIN_KEYWORDS.some((kw) => normalized.includes(kw))
}

function matchTaskKeywords(taskDescription) {
  const lower = String(taskDescription ?? '').toLowerCase()
  return RISK_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()))
}

function isMetaPipelinePath(filePath) {
  const normalized = String(filePath).toLowerCase().replace(/\\/g, '/').replace(/^\.\//, '')
  return META_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function isMetaPipelineOnlyChange(changedFiles) {
  const files = changedFiles ?? []
  if (files.length === 0) return false
  return files.every(isMetaPipelinePath)
}

function classifyRisk(taskDescription, changedFiles = []) {
  const matchedKeywords = matchTaskKeywords(taskDescription)
  const matchedPaths = (changedFiles ?? []).filter(isHighRiskPath)
  const hasChangedFiles = (changedFiles ?? []).length > 0
  const isHighRisk = hasChangedFiles ? matchedPaths.length > 0 : matchedKeywords.length > 0
  return { isHighRisk, matchedKeywords, matchedPaths }
}

// 戻り値: { route: 'meta'|'confirm'|'deep'|'light', isHighRisk, isMetaChange, matchedKeywords, matchedPaths }
function classifyRoute(taskDescription, changedFiles = []) {
  if (isMetaPipelineOnlyChange(changedFiles)) {
    return { route: 'meta', isHighRisk: false, isMetaChange: true, matchedKeywords: [], matchedPaths: [] }
  }
  const { isHighRisk, matchedKeywords, matchedPaths } = classifyRisk(taskDescription, changedFiles)
  const hasChangedFiles = (changedFiles ?? []).length > 0
  if (!hasChangedFiles && matchedKeywords.length > 0) {
    return { route: 'confirm', isHighRisk, isMetaChange: false, matchedKeywords, matchedPaths }
  }
  return { route: isHighRisk ? 'deep' : 'light', isHighRisk, isMetaChange: false, matchedKeywords, matchedPaths }
}

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const taskDescription = parsedArgs?.taskDescription ?? '現在のコードベース全体の調査'
const maxRounds = parsedArgs?.maxRounds ?? 3
const changedFiles = parsedArgs?.changedFiles ?? []

phase('Route')

const { route, isHighRisk, isMetaChange, matchedKeywords, matchedPaths } = classifyRoute(taskDescription, changedFiles)

if (route === 'meta') {
  log(`メタ改修検知（変更ファイル: ${changedFiles.join(', ') || 'なし'}）→ Sweepをスキップし、直接設計検討へ`)
  return {
    route: 'aidd-phase1-meta',
    matchedKeywords,
    matchedPaths,
    isMetaChange,
    result: {
      findings: {
        meta: '`.claude/workflows/`・`.claude/agents/`・`docs/agents/`配下のみの変更のため、4軸Sweep（ui/data/db/types）は実行していません。プロダクトコードへの影響が無いことを前提に、直接設計・実装検討に進んでください。',
      },
    },
  }
}

if (route === 'confirm') {
  log(`changedFiles未確定でキーワードのみ一致（${matchedKeywords.join(', ')}）→ 自動起動を保留し、人間の確認を求める`)
  return {
    route: 'aidd-phase1-needs-confirmation',
    matchedKeywords,
    matchedPaths,
    isMetaChange,
    result: {
      needsConfirmation: true,
      reason: `taskDescription中のキーワード一致（${matchedKeywords.join('、')}）のみでリスク該当と判定されました。changedFilesが空の場合、キーワード一致は「〜には触れない」等の否定文脈を区別できません。実際に認証/RLS/マイグレーション等のドメインに触れる変更か、人間に確認してから実行してください。`,
    },
  }
}

if (route === 'deep') {
  log(
    `高リスク判定（キーワード: ${matchedKeywords.join(', ') || 'なし'} / 変更ファイル: ${matchedPaths.join(', ') || 'なし'}）。` +
      'riff-gearには現時点で深掘りワークフロー(aidd-1-1-deep-task相当)が無いため、通常のSweepを実行します。結果は人間が慎重にレビューしてください。'
  )
}

// 注記: このWorkflow実行環境ではworktree配下の.claude/workflows/にある名前付きワークフローを
// workflow()で入れ子呼び出しできない場合がある（ビルトイン以外は名前解決できないケースを確認済み）。
// そのためaidd-phase1.jsのSweep+Loop-Until-Dryロジックをここにインライン展開する
// （aidd-phase1.js自体はscriptPath指定で単独実行することも可能なよう残してある）。

const AGENT_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pass', 'blocked'] },
    detail: { type: 'string' },
  },
  required: ['status', 'detail'],
}

const STATUS_GUIDE = `

## 出力形式
status と detail を返すこと。
- status: "pass"=調査を最後まで実行できた(指摘の有無は問わない) / "blocked"=権限不足・対象コード不在等で調査自体が実行できなかった
- detail: 調査結果の本文(指摘が無ければ「指摘なし」と書く)`

function describeSweepResult(result) {
  if (result === null) return '(実行失敗: エージェントが結果を返しませんでした。手動で再実行してください)'
  return result.detail ?? '指摘なし'
}

let round = 0
let dryStreak = 0
let lastFindings = null
const extraInstructions = []

while (round < maxRounds && dryStreak < 2) {
  round++
  phase('Sweep')
  log(`Sweep ラウンド${round}開始`)

  const extraContext =
    extraInstructions.length > 0
      ? `\n\n## 過去ラウンドで指摘された追加調査対象\n${extraInstructions.map((h, i) => `ラウンド${i + 1}: ${h}`).join('\n')}`
      : ''
  const sweepPrompt = `タスク: ${taskDescription}${extraContext}${STATUS_GUIDE}`

  const [uiResult, dataResult, dbResult, typesResult] = await parallel([
    () => agent(sweepPrompt, { label: 'sweep-ui', agentType: 'sweep-ui', phase: 'Sweep', schema: AGENT_RESULT_SCHEMA, effort: 'low' }),
    () => agent(sweepPrompt, { label: 'sweep-data', agentType: 'sweep-data', phase: 'Sweep', schema: AGENT_RESULT_SCHEMA, effort: 'low' }),
    () => agent(sweepPrompt, { label: 'sweep-db', agentType: 'sweep-db', phase: 'Sweep', schema: AGENT_RESULT_SCHEMA, effort: 'low' }),
    () => agent(sweepPrompt, { label: 'sweep-types', agentType: 'sweep-types', phase: 'Sweep', schema: AGENT_RESULT_SCHEMA, effort: 'low' }),
  ])

  const results = [uiResult, dataResult, dbResult, typesResult]
  const failedCount = results.filter((r) => r === null).length
  if (failedCount === results.length) {
    throw new Error(`Sweep全4体(ui/data/db/types)がラウンド${round}でagent()の実行失敗(null)を返しました。findingsを「指摘なし」で埋めた偽の正常完了を返さないため中断します。`)
  }

  lastFindings = {
    ui: describeSweepResult(uiResult),
    data: describeSweepResult(dataResult),
    db: describeSweepResult(dbResult),
    types: describeSweepResult(typesResult),
  }
  log('Sweep 完了')

  phase('Critic')
  const criticPrompt = `## タスク\n${taskDescription}\n\n## 今ラウンド(${round})のSweep報告\n${JSON.stringify(lastFindings, null, 2)}`
  const criticResult = await agent(criticPrompt, { label: 'completeness-critic', agentType: 'completeness-critic', phase: 'Critic' })

  const criticText = typeof criticResult === 'string' ? criticResult.trim() : null
  if (criticText === '新規指摘なし') {
    dryStreak++
    log(`ラウンド${round}: 追加調査対象なし（dry streak ${dryStreak}/2）`)
  } else {
    dryStreak = 0
    extraInstructions.push(criticText ?? '(completeness-critic実行失敗)')
    log(`ラウンド${round}: 追加調査対象あり、次ラウンドへ`)
  }
}

return {
  route: isHighRisk ? 'aidd-phase1-high-risk' : 'aidd-phase1',
  matchedKeywords,
  matchedPaths,
  isMetaChange,
  result: {
    findings: lastFindings,
    rounds: round,
    dryStreak,
  },
}
