export const meta = {
  name: 'aidd-phase2',
  description: '実装フェーズ: 影響レイヤー(db/data/ui)を並列実装 → integratorで統合(build/test/lint/typecheck) → 4観点並列レビュー、fail時は最大N回差し戻し',
  whenToUse: 'Phase1調査(aidd-phase1-router)と設計方針の確認が終わり、実装に入る段階で使う。SPEC.mdは前提にせず、taskDescriptionと影響レイヤー(layers)を直接渡す。',
  phases: [
    { title: 'Implement', detail: '影響レイヤー(db/data/ui)を並列実装' },
    { title: 'Integrate', detail: '結線・build/test/lint/typecheckで統合確認' },
    { title: 'Review', detail: '4観点(正しさ/仕様網羅/重複・過剰実装/型安全)を並列レビュー' },
  ],
}

// args: { taskDescription: string, layers?: ('db'|'data'|'ui')[], maxReviewRetries?: number }
// layers: 実装が必要なレイヤー。省略時は db/data/ui の3体すべてを起動する
//   （呼び出し側がPhase1のfindingsやタスク内容から影響レイヤーを絞れる場合は指定した方が無駄が無い）

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pass', 'blocked'] },
    detail: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'detail', 'changedFiles'],
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
]

function describeResult(result) {
  if (result === null) return '(実行失敗: エージェントが結果を返しませんでした)'
  return result.detail ?? '(detail無し)'
}

async function runImplementLayers(taskDescription, layers, extraContext, labelSuffix) {
  const prompt = `タスク: ${taskDescription}${extraContext}`
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
  log(`レビュー実行(試行 ${retry + 1}/${maxReviewRetries + 1})`)
  const reviewResults = await parallel(
    REVIEW_FOCUSES.map((f) => () =>
      agent(
        `タスク: ${taskDescription}\n\n変更ファイル一覧:\n${changedFiles.join('\n') || '(無し)'}\n\nレビュー観点: ${f.label}のみを検証すること`,
        { label: `reviewer-${f.key}`, agentType: 'reviewer', phase: 'Review', schema: REVIEW_SCHEMA }
      )
    )
  )

  const failedFocuses = REVIEW_FOCUSES.filter((_, i) => reviewResults[i] === null || reviewResults[i]?.status !== 'pass')
  if (failedFocuses.length === 0) {
    return {
      route: 'aidd-phase2-pass',
      result: { detail: 'レビュー全観点pass', changedFiles, retries: retry },
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
