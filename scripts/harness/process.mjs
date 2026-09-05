import { spawn } from 'node:child_process'

// shell:false のargv実行。無応答や出力暴走でも有限時間で終了する。
export function runProcess(file, args, { cwd, timeoutMs, input = '', signal }) {
  return new Promise(resolve => {
    const child = spawn(file, args, { cwd, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', timedOut = false, overflow = false, spawnError = null, killTimer
    function kill(sig) {
      if (!child.pid) return
      try {
        if (process.platform === 'win32') child.kill(sig)
        else process.kill(-child.pid, sig)
      } catch { /* 終了済み */ }
    }
    function stop() { kill('SIGTERM'); killTimer ??= setTimeout(() => kill('SIGKILL'), 500) }
    const timer = setTimeout(() => { timedOut = true; stop() }, timeoutMs)
    const abort = () => stop()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) stop()
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
      stream.setEncoding('utf8')
      stream.on('data', chunk => {
        if (stdout.length + stderr.length + chunk.length > 2_000_000) { overflow = true; stop(); return }
        if (name === 'stdout') stdout += chunk; else stderr += chunk
      })
    }
    child.on('error', e => { spawnError = e.message })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
    child.on('close', (exitCode, exitSignal) => {
      // 親だけ終了してstdioを切り離した孫が残る場合も、排他解除より先に停止する。
      // 正常終了でも、この工程から残されたバックグラウンド処理は引き継がない。
      kill('SIGKILL')
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort)
      resolve({ exitCode, exitSignal, stdout, stderr, timedOut, overflow, spawnError, aborted: Boolean(signal?.aborted) })
    })
  })
}
