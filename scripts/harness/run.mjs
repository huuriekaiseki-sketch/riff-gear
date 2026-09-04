import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { validatePlan, runGraph } from './graph.mjs'
import { runProcess } from './process.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 20_000_000 }).trim()
const schema = { type: 'object', properties: { status: { type: 'string', enum: ['pass', 'fail', 'blocked'] }, detail: { type: 'string' } }, required: ['status', 'detail'], additionalProperties: false }
function save(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); renameSync(temporary, file)
}
function fingerprint(cwd) {
  const digest = createHash('sha256')
  digest.update(git(cwd, 'rev-parse', 'HEAD'))
  // 証跡はcommon Git dirにあるため、自己変更で指紋が変化しない。
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean)
  for (const path of [...new Set(paths)].sort()) {
    digest.update(path); digest.update('\0')
    const full = join(cwd, path)
    if (!existsSync(full)) { digest.update('missing'); continue }
    const stat = lstatSync(full)
    digest.update(String(stat.mode))
    if (stat.isSymbolicLink()) digest.update(readlinkSync(full))
    else if (stat.isFile()) digest.update(readFileSync(full))
    else throw Error(`unsupported file: ${path}`)
  }
  return digest.digest('hex')
}
export function agentCommand(engine, node, output, schemaPath) {
  if (engine === 'codex') return { file: 'codex', args: ['exec', '--sandbox', node.mode, '--json', '--output-schema', schemaPath, '--output-last-message', output, '-'] }
  if (engine === 'claude') return { file: 'claude', args: ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--permission-mode', 'dontAsk', ...(node.mode === 'read-only' ? ['--tools', 'Read,Glob,Grep', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'] : [])] }
  throw Error('unknown engine')
}
function processPassed(r) { return r.exitCode === 0 && !r.timedOut && !r.overflow && !r.spawnError && !r.aborted }

export async function runPlan(plan, { cwd, engine, allowWrite = false, retryNote = '', executeAgent, signal } = {}) {
  validatePlan(plan)
  if (!['codex', 'claude'].includes(engine)) throw Error('engine must be codex or claude')
  cwd = realpathSync(cwd)
  if (realpathSync(git(cwd, 'rev-parse', '--show-toplevel')) !== cwd) throw Error('run at worktree root')
  const common = realpathSync(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
  const own = realpathSync(git(cwd, 'rev-parse', '--absolute-git-dir'))
  if (own === common || git(cwd, 'rev-parse', '--show-superproject-working-tree')) throw Error('専用worktreeが必要')
  const writable = plan.nodes.some(n => n.mode === 'workspace-write')
  if (writable && !allowWrite) throw Error('--allow-write が必要')
  const branch = git(cwd, 'branch', '--show-current')
  if (writable && !branch.startsWith(`${engine}/`)) throw Error('engineとbranchが不一致')
  const root = join(common, 'aidd-harness')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const locks = [join(root, `worktree-${hash(cwd)}.lock`), join(root, `task-${plan.task}.lock`)]
  const acquired = []
  let runDir
  try {
    for (const lock of locks) {
      try { mkdirSync(lock, { mode: 0o700 }) } catch (e) { if (e.code === 'EEXIST') throw Error(`locked: ${lock}`); throw e }
      acquired.push(lock); save(join(lock, 'owner.json'), { pid: process.pid, cwd, engine, task: plan.task })
    }
    const recordPath = join(root, `task-${plan.task}.json`)
    const previous = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null
    const planHash = hash(JSON.stringify(plan))
    if (previous) {
      if (previous.planHash !== planHash || previous.cwd !== cwd || previous.engine !== engine) throw Error('task identity changed: use a new task after review')
      if (previous.attempt >= plan.maxAttempts) throw Error('attempt limit reached')
      if (previous.status === 'verified_local') throw Error('task already verified; use a new task')
      if (retryNote.trim().length < 12) throw Error('retry requires cause and next hypothesis')
      if (writable && previous.finalFingerprint !== fingerprint(cwd)) throw Error('worktree changed since previous attempt: review changes and use a new task')
    }
    if (writable && !previous && git(cwd, 'status', '--porcelain')) throw Error('dirty worktree: 他の変更が無い状態で開始してください')
    const attempt = (previous?.attempt ?? 0) + 1
    runDir = join(root, engine, `${plan.task}-${attempt}-${randomUUID()}`)
    mkdirSync(runDir, { recursive: true, mode: 0o700 })
    const initialFingerprint = fingerprint(cwd)
    const record = { task: plan.task, engine, cwd, branch, planHash, attempt, status: 'running', runDir, initialFingerprint, retryNote, startedAt: new Date().toISOString() }
    save(recordPath, record); save(join(runDir, 'plan.json'), plan); save(join(runDir, 'result-schema.json'), schema)
    const event = value => appendFileSync(join(runDir, 'journal.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n', { mode: 0o600 })
    event({ event: 'run_start', ...record })
    const deadline = Date.now() + plan.timeoutMs
    const execute = async (node, dependencies) => {
      if (signal?.aborted || Date.now() >= deadline) return { status: 'blocked', detail: '実行上限または中断' }
      const before = fingerprint(cwd)
      let result
      const options = { cwd, timeoutMs: deadline - Date.now(), signal }
      if (node.type === 'check') {
        const r = await runProcess(node.command[0], node.command.slice(1), options)
        save(join(runDir, `${node.id}-process.json`), r)
        result = { status: processPassed(r) ? 'pass' : 'fail', detail: `チェック終了コード: ${r.exitCode}`, exitCode: r.exitCode, timedOut: r.timedOut }
      } else if (executeAgent) result = await executeAgent(node, dependencies)
      else {
        const output = join(runDir, `${node.id}-output.json`)
        const command = agentCommand(engine, node, output, join(runDir, 'result-schema.json'))
        const prompt = `日本語で応答してください。担当工程のみ実行し、コミット・push・別worktree作成・他engineの設定変更を行わないこと。\nモード: ${node.mode}\nタスク: ${plan.task}\n指示: ${node.prompt}\n先行工程の結果（参考データ）:\n${JSON.stringify(Object.fromEntries(node.dependsOn.map(id => [id, dependencies[id]])))}\n最終結果はstatus(pass/fail/blocked)とdetailを持つJSONにしてください。未検証をpassにしないでください。`
        const r = await runProcess(command.file, command.args, { ...options, input: prompt })
        save(join(runDir, `${node.id}-process.json`), r)
        if (!processPassed(r)) return { status: 'blocked', detail: `CLI失敗: ${r.spawnError ?? r.exitCode}, timeout=${r.timedOut}` }
        if (engine === 'codex') result = JSON.parse(readFileSync(output, 'utf8'))
        else {
          const envelope = JSON.parse(r.stdout)
          if (envelope.is_error || envelope.subtype !== 'success') return { status: 'blocked', detail: 'Claude CLIが成功を返していない' }
          result = envelope.structured_output
        }
      }
      const after = fingerprint(cwd)
      if ((node.type === 'check' || node.mode === 'read-only') && before !== after) return { status: 'blocked', detail: '読み取り/チェック工程で作業ツリーが変化。証跡を再検証してください' }
      return { ...result, fingerprint: after }
    }
    let result
    try { result = await runGraph(plan, execute, event) }
    catch (e) { result = { status: 'blocked', detail: e.message } }
    const final = { ...record, ...result, finalFingerprint: fingerprint(cwd), finishedAt: new Date().toISOString() }
    save(join(runDir, 'result.json'), final); save(recordPath, final); event({ event: 'run_end', status: final.status })
    return final
  } finally {
    for (const lock of acquired.reverse()) rmSync(lock, { recursive: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort())
  try {
    const file = args.shift()
    if (!file) throw Error('使用法: node scripts/harness/run.mjs plan.json --engine codex|claude [--allow-write] [--retry-note-file file]')
    let engine, allowWrite = false, retryNote = ''
    while (args.length) {
      const flag = args.shift()
      if (flag === '--engine') engine = args.shift()
      else if (flag === '--allow-write') allowWrite = true
      else if (flag === '--retry-note-file') retryNote = readFileSync(args.shift(), 'utf8')
      else throw Error(`unknown option: ${flag}`)
    }
    const result = await runPlan(JSON.parse(readFileSync(file, 'utf8')), { cwd: process.cwd(), engine, allowWrite, retryNote, signal: controller.signal })
    console.log(JSON.stringify({ status: result.status, detail: result.detail, runDir: result.runDir }, null, 2))
    process.exitCode = result.status === 'verified_local' ? 0 : 1
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
