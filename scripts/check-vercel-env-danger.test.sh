#!/bin/bash
# WHY: PreToolUse hook(scripts/check-vercel-env-danger.sh)の回帰テスト。
# bare/package runnerだけでなく、絶対・相対パス経由のvercel env rm/removeも
# Codexではdeny、Claudeではaskにし、危険時の理由を必ず返すことを確認する。
# セグメント連結を検知し、安全なコマンドは無出力のままにする。
#
# 実行: bash scripts/check-vercel-env-danger.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-vercel-env-danger.sh"

fail=0
assert_eq() {
  local actual="$1" expected="$2" label="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  OK: $label"
  else
    echo "  NG: $label (expected=$expected actual=$actual)"
    fail=1
  fi
}

assert_empty() {
  local actual="$1" label="$2"
  if [ -z "$actual" ]; then
    echo "  OK: $label"
  else
    echo "  NG: $label (actual=$actual)"
    fail=1
  fi
}

assert_file_absent() {
  local path="$1" label="$2"
  if [ ! -e "$path" ]; then
    echo "  OK: $label"
  else
    echo "  NG: $label (unexpected file=$path)"
    fail=1
  fi
}

assert_decision_and_reason() {
  local actual="$1" expected="$2" label="$3"
  local decision reason
  decision="$(printf '%s' "$actual" | jq -r '.hookSpecificOutput.permissionDecision // ""')"
  reason="$(printf '%s' "$actual" | jq -r '.hookSpecificOutput.permissionDecisionReason // ""')"
  assert_eq "$decision" "$expected" "$label: permissionDecision=$expected"
  if [ -n "$reason" ]; then
    echo "  OK: $label: permissionDecisionReasonが非空"
  else
    echo "  NG: $label: permissionDecisionReasonが空 (actual=$actual)"
    fail=1
  fi
}

run_hook() {
  local command="$1" runtime="${2:-codex}"
  local input
  input="$(jq -n --arg command "$command" '{tool_name: "Bash", tool_input: {command: $command}}')"
  set +e
  OUT="$(printf '%s' "$input" | bash "$SCRIPT" "$runtime")"
  EXIT_CODE=$?
  set -e
}

echo "=== scenario 1: bare vercel env rm → Codex deny + reason ==="
run_hook "vercel env rm SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "bare rm"

echo "=== scenario 2: bare vercel env remove → Claude ask + reason ==="
run_hook "vercel env remove SUPABASE_SERVICE_ROLE_KEY" claude
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "ask" "bare remove"

echo "=== scenario 3: npx vercel env rm → deny + reason ==="
run_hook "npx vercel env rm SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "npx"

echo "=== scenario 4: pnpm dlx vercel env remove → deny + reason ==="
run_hook "pnpm dlx vercel env remove SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "pnpm dlx"

echo "=== scenario 5: yarn dlx vercel env rm → deny + reason ==="
run_hook "yarn dlx vercel env rm SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "yarn dlx"

echo "=== scenario 6: 絶対パスvercel env rm → deny + reason ==="
run_hook "/usr/local/bin/vercel env rm SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "絶対パス"

echo "=== scenario 7: 絶対パスvercel env remove → Claude ask + reason ==="
run_hook "/usr/local/bin/vercel env remove SUPABASE_SERVICE_ROLE_KEY" claude
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "ask" "絶対パスClaude"

echo "=== scenario 8: 環境変数代入付きvercel env rm → deny + reason ==="
run_hook "VERCEL_TOKEN=x vercel env rm SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "環境変数代入"

echo "=== scenario 9: env経由vercel env remove → deny + reason ==="
run_hook "env VERCEL_TOKEN=x vercel env remove SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "env経由"

echo "=== scenario 10: 空値の環境変数代入付きvercel env rm → deny + reason ==="
run_hook "VERCEL_TOKEN= vercel env rm SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "空値環境変数代入"

echo "=== scenario 11: 空値のenv経由vercel env remove → deny + reason ==="
run_hook "env VERCEL_TOKEN= vercel env remove SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "空値env経由"

echo "=== scenario 12: sudo vercel env rm → deny + reason ==="
run_hook "sudo vercel env rm SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "sudo経由"

echo "=== scenario 13: echo内のvercel env rm → 安全側でdeny + reason ==="
run_hook "echo /usr/local/bin/vercel env rm SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "表示文字列内も安全側で拒否"

echo "=== scenario 14: 相対パスvercel env remove → deny + reason ==="
run_hook "./node_modules/.bin/vercel env remove SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "相対パス"

echo "=== scenario 15: 連結コマンド内の絶対パスvercel env rm → deny + reason ==="
run_hook "echo before; /usr/local/bin/vercel env rm SUPABASE_SERVICE_ROLE_KEY"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "連結コマンド"

echo "=== scenario 16: 通常コマンド → 無出力 ==="
run_hook "npm test"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "安全なコマンドは無出力"

echo "=== scenario 17: vercel env ls → 無出力 ==="
run_hook "vercel env ls"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "安全なvercelコマンドは無出力"

echo "=== scenario 18: echo内command substitution → deny + reason ==="
run_hook 'echo "$(vercel env rm KEY preview --yes)"'
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "echo内command substitution"

echo "=== scenario 19: 代入内command substitution → deny + reason ==="
run_hook 'result=$(vercel env rm KEY preview --yes)'
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "代入内command substitution"

echo "=== scenario 20: command wrapper → deny + reason ==="
run_hook "command vercel env rm KEY preview --yes"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "command wrapper"

echo "=== scenario 21: env option wrapper → deny + reason ==="
run_hook "env -i vercel env rm KEY preview --yes"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "env -i wrapper"

echo "=== scenario 22: sudo option wrapper → deny + reason ==="
run_hook "sudo -n vercel env rm KEY preview --yes"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "sudo -n wrapper"

echo "=== scenario 23: hookはshell入力をevalしない ==="
marker_dir="$(mktemp -d)"
marker="$marker_dir/must-not-exist"
trap 'rm -f "$marker"; rmdir "$marker_dir"' EXIT
run_hook "echo \$(touch \"$marker\"); vercel env rm KEY preview --yes"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_decision_and_reason "$OUT" "deny" "副作用を含む入力"
assert_file_absent "$marker" "入力中のcommand substitutionを実行しない"

if [ "$fail" -ne 0 ]; then
  echo "FAILED"
  exit 1
fi
echo "ALL PASSED"
