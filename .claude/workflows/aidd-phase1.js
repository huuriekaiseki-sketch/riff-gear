export const meta = {
  name: 'aidd-phase1',
  description: 'Phase 1 調査: UI/データ/DB/型の4軸並列Sweep。Completeness Criticが2ラウンド連続で「新規指摘なし」を返すまでループする(最大maxRoundsラウンド)。',
  whenToUse: '新機能追加・改修前に既存コード構造を把握したいときに使う。実装前の調査フェーズ。',
  phases: [
    { title: 'Sweep', detail: '4軸並列Sweep（UI/データ/DB/型）' },
    { title: 'Critic', detail: '追加調査が必要か判定（Loop-Until-Dry）' },
  ],
}

// args: { taskDescription?: string, maxRounds?: number }
// taskDescription: 追加・実装したい機能の説明（例:「レビュー機能の追加」）
// maxRounds: Loop-Until-Dryの上限ラウンド数（デフォルト3）

// Workflowツール実行系のargsがverbatimでなく文字列化されて渡ってくることがあるための保険
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const taskDescription = parsedArgs?.taskDescription ?? '現在のコードベース全体の調査'
const maxRounds = parsedArgs?.maxRounds ?? 3

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
  findings: lastFindings,
  rounds: round,
  dryStreak,
  stats: {
    phase: 'phase1',
    rounds: round,
  },
}
