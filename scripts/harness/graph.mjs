// 工程順と上限の判断をモデルの自己申告から分離する。
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const bounded = (value, max) => Number.isInteger(value) && value > 0 && value <= max
export function validatePlan(plan) {
  if (!plan || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(plan.task)) throw Error('invalid task')
  if (!bounded(plan.maxConcurrent, 8) || !bounded(plan.timeoutMs, 900000) || !bounded(plan.maxAttempts, 4)) throw Error('invalid limits')
  if (!Array.isArray(plan.nodes) || !bounded(plan.nodes.length, 40)) throw Error('invalid nodes')
  const nodes = new Map()
  for (const n of plan.nodes) {
    if (!/^[a-z][a-z0-9-]{0,59}$/.test(n.id) || nodes.has(n.id)) throw Error('invalid/duplicate node id')
    if (!Array.isArray(n.dependsOn) || !n.dependsOn.every(nonempty) || new Set(n.dependsOn).size !== n.dependsOn.length) throw Error('invalid dependencies')
    if (n.type === 'agent') {
      if (!nonempty(n.prompt) || !['read-only', 'workspace-write'].includes(n.mode)) throw Error('invalid agent')
    } else if (n.type === 'check') {
      if (!Array.isArray(n.command) || !n.command.length || !n.command.every(nonempty)) throw Error('invalid command argv')
    } else throw Error('invalid node type')
    nodes.set(n.id, n)
  }
  const visiting = new Set(), ancestors = new Map()
  function visit(id) {
    if (!nodes.has(id)) throw Error('unknown dependency')
    if (visiting.has(id)) throw Error('cyclic graph')
    if (ancestors.has(id)) return ancestors.get(id)
    visiting.add(id)
    const found = new Set()
    for (const dep of nodes.get(id).dependsOn) {
      found.add(dep)
      for (const parent of visit(dep)) found.add(parent)
    }
    visiting.delete(id); ancestors.set(id, found); return found
  }
  for (const id of nodes.keys()) visit(id)
  const writers = plan.nodes.filter(n => n.mode === 'workspace-write')
  const checks = plan.nodes.filter(n => n.type === 'check')
  // 全チェックが全書き込みの後に実行されるため、古い成功を最終証拠にできない。
  if (writers.length && (!checks.length || checks.some(c => writers.some(w => !ancestors.get(c.id).has(w.id))))) {
    throw Error('checks must depend on all writers')
  }
  return plan
}
export async function runGraph(plan, execute, onEvent = () => {}) {
  validatePlan(plan)
  const pending = new Map(plan.nodes.map(n => [n.id, n])), results = {}
  while (pending.size) {
    const ready = [...pending.values()].filter(n => n.dependsOn.every(id => results[id]?.status === 'pass'))
    if (!ready.length) return { status: 'blocked', results, detail: '依存工程未完了' }
    const exclusive = ready.find(n => n.type === 'check' || n.mode === 'workspace-write')
    const batch = exclusive ? [exclusive] : ready.slice(0, plan.maxConcurrent)
    const outcomes = await Promise.all(batch.map(async n => {
      onEvent({ event: 'node_start', node: n.id })
      let result
      try { result = await execute(n, results) } catch (e) { result = { status: 'blocked', detail: e.message } }
      if (!result || !['pass', 'fail', 'blocked'].includes(result.status) || !nonempty(result.detail)) {
        result = { status: 'blocked', detail: '結果形式不正' }
      }
      onEvent({ event: 'node_end', node: n.id, result })
      return [n.id, result]
    }))
    for (const [id, result] of outcomes) { results[id] = result; pending.delete(id) }
    if (outcomes.some(([, r]) => r.status !== 'pass')) return { status: 'blocked', results, detail: '工程失敗。後続は未実行' }
  }
  return { status: 'verified_local', results, detail: '計画内の全工程が成功。GitHub CI・統合は別途確認が必要' }
}
