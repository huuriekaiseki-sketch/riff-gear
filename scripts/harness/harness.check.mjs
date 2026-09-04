import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { validatePlan, runGraph } from './graph.mjs'
import { runProcess } from './process.mjs'
import { runPlan, agentCommand } from './run.mjs'

const agent = (id, dependsOn = []) => ({ id, type: 'agent', prompt: '読み取り調査', dependsOn, mode: 'read-only' })
const plan = (nodes = [agent('survey')]) => ({ task: 'sample', maxConcurrent: 2, timeoutMs: 2000, maxAttempts: 2, nodes })
const pass = { status: 'pass', detail: '確認済み' }
function repo(t) {
  const base = mkdtempSync(join(tmpdir(), 'shared-harness-test-'))
  const main = join(base, 'main'), work = join(base, 'work')
  mkdirSync(main)
  const git = (...args) => execFileSync('git', args, { cwd: main, stdio: 'pipe' })
  git('init'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'test')
  writeFileSync(join(main, 'source.txt'), 'original')
  git('add', 'source.txt'); git('commit', '-m', 'fixture')
  git('worktree', 'add', '-b', 'codex/test', work)
  t.after(() => rmSync(base, { recursive: true, force: true }))
  return { main, work }
}

test('循環・未知依存・重複ID・無制限設定を開始前に拒否する', () => {
  for (const p of [plan([agent('a', ['b']), agent('b', ['a'])]), plan([agent('a', ['missing'])]),
    plan([agent('a'), agent('a')]), { ...plan(), timeoutMs: 0 }, { ...plan(), maxAttempts: 99 }]) {
    assert.throws(() => validatePlan(p))
  }
})
test('書き込みの後に必須チェックが無ければ拒否する', () => {
  assert.throws(() => validatePlan(plan([{ ...agent('write'), mode: 'workspace-write' }])))
})
test('4軸を2枠で実行し、全結果が揃ってからcriticを開始する', async () => {
  let active = 0, peak = 0
  const finished = []
  const result = await runGraph(plan([...['ui', 'data', 'db', 'types'].map(id => agent(id)), agent('critic', ['ui', 'data', 'db', 'types'])]), async n => {
    if (n.id === 'critic') assert.equal(finished.length, 4)
    peak = Math.max(peak, ++active)
    await new Promise(resolve => setTimeout(resolve, 10))
    active--; finished.push(n.id); return pass
  })
  assert.equal(peak, 2); assert.equal(result.status, 'verified_local'); assert.equal(finished.length, 5)
})
test('失敗・不正応答で後続を起動しない', async () => {
  for (const response of [null, { status: 'pass', detail: '' }, { status: 'fail', detail: '検出' }]) {
    const calls = []
    const result = await runGraph(plan([agent('a'), agent('b', ['a'])]), async n => { calls.push(n.id); return response })
    assert.equal(result.status, 'blocked'); assert.deepEqual(calls, ['a'])
  }
})
test('シェル文字列として評価せず、実際の非ゼロ終了コードを保存する', async () => {
  const r = await runProcess(process.execPath, ['-e', 'console.log(process.argv[1]);process.exit(7)', '$(touch unwanted)'], { cwd: tmpdir(), timeoutMs: 2000 })
  assert.equal(r.exitCode, 7); assert.match(r.stdout, /\$\(touch unwanted\)/)
})
test('タイムアウトで実プロセスを停止する', async () => {
  const r = await runProcess(process.execPath, ['-e', 'setInterval(()=>{},100)'], { cwd: tmpdir(), timeoutMs: 50 })
  assert.equal(r.timedOut, true); assert.notEqual(r.exitCode, 0)
})
test('親が先に終了してもSIGTERMを無視する孫を残さない', async t => {
  if (process.platform === 'win32') return t.skip('POSIXプロセスグループのテスト')
  const dir = mkdtempSync(join(tmpdir(), 'harness-grandchild-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const script = `const {spawn}=require('child_process');const c=spawn(process.execPath,['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},100)'],{stdio:'ignore'});require('fs').writeFileSync('pid',String(c.pid));setInterval(()=>{},100)`
  await runProcess(process.execPath, ['-e', script], { cwd: dir, timeoutMs: 300 })
  const pid = Number(readFileSync(join(dir, 'pid'), 'utf8'))
  t.after(() => { try { process.kill(pid, 'SIGKILL') } catch { /* 終了済み */ } })
  await new Promise(resolve => setTimeout(resolve, 100))
  let alive = false
  try { process.kill(pid, 0); alive = true } catch { /* 期待する終了 */ }
  assert.equal(alive, false)
})
test('main作業場所と相手の書き込みブランチを拒否する', async t => {
  const { main, work } = repo(t)
  await assert.rejects(runPlan(plan(), { cwd: main, engine: 'codex' }), /worktree/)
  const p = plan([{ ...agent('write'), mode: 'workspace-write' }, { id: 'check', type: 'check', dependsOn: ['write'], command: ['true'] }])
  await assert.rejects(runPlan(p, { cwd: work, engine: 'claude', allowWrite: true }), /branch/)
})
test('書込み承認なし・未コミット変更ありなら書込みを開始しない', async t => {
  const { work } = repo(t)
  const p = plan([{ ...agent('write'), mode: 'workspace-write' }, { id: 'check', type: 'check', dependsOn: ['write'], command: ['true'] }])
  await assert.rejects(runPlan(p, { cwd: work, engine: 'codex' }), /allow-write/)
  writeFileSync(join(work, 'source.txt'), 'other session')
  await assert.rejects(runPlan(p, { cwd: work, engine: 'codex', allowWrite: true }), /dirty/)
})
test('失敗チェックは証跡に残り、後続のマーカーは作られない', async t => {
  const { work } = repo(t)
  const p = plan([{ id: 'bad', type: 'check', dependsOn: [], command: [process.execPath, '-e', 'process.exit(9)'] },
    { id: 'later', type: 'check', dependsOn: ['bad'], command: [process.execPath, '-e', 'require("fs").writeFileSync("marker","x")'] }])
  const r = await runPlan(p, { cwd: work, engine: 'codex' })
  assert.equal(r.status, 'blocked'); assert.equal(existsSync(join(work, 'marker')), false)
  const event = readFileSync(join(r.runDir, 'journal.jsonl'), 'utf8')
  assert.match(event, /"exitCode":9/)
})
test('同worktreeの二重起動を拒否してから正常に解放する', async t => {
  const { work } = repo(t)
  let release, started
  const waiting = new Promise(resolve => { started = resolve })
  const execution = runPlan(plan(), { cwd: work, engine: 'codex', executeAgent: async () => { started(); await new Promise(resolve => { release = resolve }); return pass } })
  await waiting
  await assert.rejects(runPlan({ ...plan(), task: 'other' }, { cwd: work, engine: 'claude' }), /locked/)
  release(); assert.equal((await execution).status, 'verified_local')
  assert.equal((await runPlan({ ...plan(), task: 'next' }, { cwd: work, engine: 'codex', executeAgent: async () => pass })).status, 'verified_local')
})
test('再試行は記録必須、回数上限を超えたら実行しない', async t => {
  const { work } = repo(t)
  const options = { cwd: work, engine: 'codex', executeAgent: async () => ({ status: 'fail', detail: '失敗' }) }
  await runPlan(plan(), options)
  await assert.rejects(runPlan(plan(), options), /retry/)
  await runPlan(plan(), { ...options, retryNote: '原因: fixture。次: 同一失敗の再現を一回確認。' })
  await assert.rejects(runPlan(plan(), { ...options, retryNote: '再試行' }), /attempt/)
})
test('読み取りノードのファイル改変は成功扱いしない', async t => {
  const { work } = repo(t)
  const r = await runPlan(plan(), { cwd: work, engine: 'codex', executeAgent: async () => {
    writeFileSync(join(work, 'source.txt'), 'changed'); return pass
  } })
  assert.equal(r.status, 'blocked')
})
test('両CLIに固有の応答形式を指定し権限バイパスを使わない', () => {
  for (const engine of ['codex', 'claude']) {
    const command = agentCommand(engine, agent('a'), '/tmp/output.json', '/tmp/schema.json')
    assert.equal(command.file, engine)
    assert.equal(command.args.some(x => x.includes('dangerously')), false)
    assert.equal(command.args.some(x => x.includes('schema')), true)
  }
})
test('両アダプターを偽CLIの実プロセスと結線して応答を検証する', async t => {
  const { work } = repo(t)
  const bin = mkdtempSync(join(tmpdir(), 'harness-cli-fixture-'))
  t.after(() => rmSync(bin, { recursive: true, force: true }))
  for (const engine of ['codex', 'claude']) {
    const source = `#!${process.execPath}\nlet input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{if(!input.includes('担当工程'))process.exit(3);const result={status:'pass',detail:'fixture応答'};if(${JSON.stringify(engine)}==='codex'){const index=process.argv.indexOf('--output-last-message');require('fs').writeFileSync(process.argv[index+1],JSON.stringify(result));}else{console.log(JSON.stringify({subtype:'success',is_error:false,structured_output:result}));}});`
    writeFileSync(join(bin, engine), source); chmodSync(join(bin, engine), 0o755)
  }
  const oldPath = process.env.PATH
  try {
    process.env.PATH = `${bin}:${oldPath}`
    for (const engine of ['codex', 'claude']) {
      const r = await runPlan({ ...plan(), task: `adapter-${engine}` }, { cwd: work, engine })
      assert.equal(r.status, 'verified_local'); assert.equal(r.results.survey.detail, 'fixture応答')
    }
  } finally { process.env.PATH = oldPath }
})
test('書き込み後の実チェックを成功証跡にし、再試行前の外部変更は拒否する', async t => {
  const { work } = repo(t)
  const p = plan([{ ...agent('write'), mode: 'workspace-write' }, { id: 'check', type: 'check', dependsOn: ['write'], command: [process.execPath, '-e', 'process.exit(1)'] }])
  const options = { cwd: work, engine: 'codex', allowWrite: true, executeAgent: async () => { writeFileSync(join(work, 'source.txt'), 'own change'); return pass } }
  const r = await runPlan(p, options)
  assert.equal(r.status, 'blocked'); assert.equal(r.results.check.exitCode, 1)
  writeFileSync(join(work, 'source.txt'), 'someone else')
  await assert.rejects(runPlan(p, { ...options, retryNote: '前回失敗したチェックの根因を調べて再確認する' }), /changed since/)
})
test('同じtaskは別worktree・別engineからの同時実行も拒否する', async t => {
  const { main, work } = repo(t), other = join(main, '..', 'other')
  execFileSync('git', ['worktree', 'add', '-b', 'claude/test', other], { cwd: main, stdio: 'pipe' })
  let release, started
  const waiting = new Promise(resolve => { started = resolve })
  const execution = runPlan(plan(), { cwd: work, engine: 'codex', executeAgent: async () => { started(); await new Promise(resolve => { release = resolve }); return pass } })
  await waiting
  await assert.rejects(runPlan(plan(), { cwd: other, engine: 'claude' }), /locked/)
  release(); await execution
})
