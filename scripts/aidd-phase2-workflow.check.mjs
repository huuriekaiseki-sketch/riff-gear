// aidd-phase2.js（Workflowスクリプト）の回帰テスト。
// Workflow実行環境の注入グローバル(agent/parallel/phase/log/args)をスタブし、
// ワークフロー全体を実行して「テスト選択」の機械導出とプロンプト結線を検証する。
// 実行: node scripts/aidd-phase2-workflow.check.mjs （scripts/aidd-phase2-workflow.test.sh 経由でCIのhooks-testが常時実行）
// ファイル名が.test.mjsでないのは、vitestのデフォルトinclude(**/*.test.*)に拾われて
// 「No test suite found」でtestジョブがfailするため。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(repoRoot, '.claude/workflows/aidd-phase2.js'), 'utf8')

// Workflow実行環境ではスクリプト本体が関数として実行される（top-level returnが有効）ため、
// export文を外してAsyncFunction化することで同じ実行形態を再現する
const body = source.replace('export const meta', 'const meta')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const workflowFn = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', 'budget', body)

async function runWorkflow(argsObj, implementResponses) {
  const calls = []
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts })
    const type = opts.agentType
    if (type && type.startsWith('implementer-')) {
      const layer = type.replace('implementer-', '')
      const res = implementResponses[layer]
      if (!res) throw new Error(`スタブ未定義のレイヤー: ${layer}`)
      return res
    }
    if (type === 'integrator') return { status: 'pass', detail: 'ok' }
    if (type === 'reviewer') return { status: 'pass', detail: '指摘なし' }
    throw new Error(`想定外のagentType: ${type}`)
  }
  const parallel = (thunks) => Promise.all(thunks.map((t) => t().catch(() => null)))
  const result = await workflowFn(argsObj, agent, parallel, () => {}, () => {}, { total: null })
  return { result, calls }
}

let failures = 0
function assert(cond, message) {
  if (cond) {
    console.log(`  ok: ${message}`)
  } else {
    failures++
    console.error(`  NG: ${message}`)
  }
}

function testselectionPrompt(calls) {
  const call = calls.find((c) => c.opts.label === 'reviewer-testselection')
  if (!call) throw new Error('reviewer-testselection の呼び出しが見つからない')
  return call.prompt
}

// 必須セクション（「必須テスト種別」〜「推奨テスト種別」の間）と推奨セクションに分割する
function splitSections(prompt) {
  const [head, rest] = prompt.split('推奨テスト種別')
  return { required: head.split('必須テスト種別')[1] ?? '', recommended: rest ?? '' }
}

console.log('case 1: リスク申告(schema_change/rpc_change/atomicity) + lib変更 → 必須/推奨の導出')
{
  const { result, calls } = await runWorkflow(
    { taskDescription: 'テスト用タスク', layers: ['db', 'data'] },
    {
      db: { status: 'pass', detail: 'ok', changedFiles: ['supabase/migrations/0029_add_check.sql'], risks: ['schema_change', 'rpc_change', 'atomicity'] },
      data: { status: 'pass', detail: 'ok', changedFiles: ['lib/orders.ts'], risks: [] },
    }
  )
  assert(result.route === 'aidd-phase2-pass', `route=aidd-phase2-pass (実際: ${result.route})`)
  const prompt = testselectionPrompt(calls)
  const { required, recommended } = splitSections(prompt)
  assert(required.includes('[DB制約]'), 'schema_change → [DB制約]が必須')
  assert(required.includes('[RPC統合]'), 'rpc_change → [RPC統合]が必須')
  assert(required.includes('[transaction]'), 'atomicity → [transaction]が必須')
  assert(required.includes('[unit]'), 'lib/**.ts変更 → [unit]が必須')
  assert(recommended.includes('[migration]'), 'migrations変更 → [migration]は未整備のため推奨止まり')
  assert(!required.includes('[migration]'), '[migration]は必須に入らない')
  assert(!prompt.includes('申告されていない'), 'DB系リスク申告済みなら申告漏れ注意は出ない')
  assert(prompt.includes('schema_change, rpc_change, atomicity'), '申告リスクがプロンプトに列挙される')
  const implCall = calls.find((c) => c.opts.label === 'implementer-db')
  assert(implCall.prompt.includes('リスク自己申告'), '実装者プロンプトにリスク申告ガイドが入る')
  assert(implCall.prompt.includes('retry_possible'), 'リスク申告ガイドにRISK_RULESのキーが展開される')
  assert(result.result.testSelection.required.includes('db_constraint'), '戻り値testSelectionに必須種別が入る')
  assert(result.result.testSelection.risks.includes('atomicity'), '戻り値testSelectionに申告リスクが入る')
}

console.log('case 2: migrations変更なのにDB系リスク未申告 → 申告漏れ注意がレビューアに渡る')
{
  const { calls } = await runWorkflow(
    { taskDescription: 'テスト用タスク', layers: ['db'] },
    {
      db: { status: 'pass', detail: 'ok', changedFiles: ['supabase/migrations/0030_something.sql'], risks: [] },
    }
  )
  const prompt = testselectionPrompt(calls)
  assert(prompt.includes('申告されていない'), '申告漏れ疑いの注意が整合性チェックに出る')
}

console.log('case 3: 仕様段階指定(specTests)と実装時導出の和集合')
{
  const { calls } = await runWorkflow(
    { taskDescription: 'テスト用タスク', layers: ['data'], specTests: ['idempotency'] },
    {
      data: { status: 'pass', detail: 'ok', changedFiles: ['lib/coupon.ts'], risks: [] },
    }
  )
  const { required } = splitSections(testselectionPrompt(calls))
  assert(required.includes('[idempotency]'), 'specTests指定 → [idempotency]が必須(和集合)')
  assert(required.includes('[unit]'), 'lib変更由来の[unit]も必須に残る(和集合)')
}

console.log('case 4: 未整備種別をspecTestsで指定 → 推奨へ自動降格、未知キーは注意に出る')
{
  const { calls } = await runWorkflow(
    { taskDescription: 'テスト用タスク', layers: ['data'], specTests: ['e2e', 'no_such_type'] },
    {
      data: { status: 'pass', detail: 'ok', changedFiles: ['app/checkout/page.tsx'], risks: [] },
    }
  )
  const prompt = testselectionPrompt(calls)
  const { required, recommended } = splitSections(prompt)
  assert(!required.includes('[E2E]'), '未整備の[E2E]は必須に入らない')
  assert(recommended.includes('[E2E]'), '未整備の[E2E]は推奨へ降格する')
  assert(recommended.includes('[UI]'), 'app/**.tsx変更 → [UI]が推奨に入る')
  assert(prompt.includes('no_such_type'), '未知のspecTestsキーは整合性チェックの注意に出る')
}

console.log('case 5: 5観点すべてのレビューアが起動する')
{
  const { calls } = await runWorkflow(
    { taskDescription: 'テスト用タスク', layers: ['data'] },
    { data: { status: 'pass', detail: 'ok', changedFiles: ['lib/x.ts'], risks: [] } }
  )
  const reviewerLabels = calls.filter((c) => c.opts.agentType === 'reviewer').map((c) => c.opts.label)
  for (const key of ['correctness', 'coverage', 'overengineering', 'typesafety', 'testselection']) {
    assert(reviewerLabels.includes(`reviewer-${key}`), `reviewer-${key} が起動する`)
  }
}

if (failures > 0) {
  console.error(`\n${failures}件のアサーション失敗`)
  process.exit(1)
}
console.log('\n全ケースpass')
