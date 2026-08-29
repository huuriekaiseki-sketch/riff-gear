#!/bin/bash
# WHY: scripts/check-handoff-format.sh(Stop hook)の回帰テスト。
# 実PR・実ghコマンドに依存させず、フェイクの`gh`実行可能ファイルと環境変数の
# 注入で決定的に検証する。
#
# 実行: bash scripts/check-handoff-format.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-handoff-format.sh"
BASH_BIN="$(command -v bash)"

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
assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    echo "  OK: $label"
  else
    echo "  NG: $label"
    echo "      expected to find: $needle"
    echo "      actual: $haystack"
    fail=1
  fi
}

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

MARKER="$WORK_DIR/marker.json"
TRANSCRIPT="$WORK_DIR/transcript.jsonl"
FAKE_GH="$WORK_DIR/fake-gh.sh"
PR_RESPONSE_FILE="$WORK_DIR/pr-response.json"

SESSION="session-aaa"
BRANCH="feature/test-branch"

cat > "$FAKE_GH" <<'EOF'
#!/bin/bash
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  if [ -f "$PR_RESPONSE_FILE" ]; then
    cat "$PR_RESPONSE_FILE"
  else
    echo "[]"
  fi
  exit 0
fi
exit 1
EOF
chmod +x "$FAKE_GH"
export PR_RESPONSE_FILE

pr_command_transcript() {
  printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"gh pr create --title x --body y"}}]}}\n' > "$TRANSCRIPT"
}
no_pr_command_transcript() {
  printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"git status"}}]}}\n' > "$TRANSCRIPT"
}
set_pr_response() {
  # $1: PR番号, $2: PR本文
  jq -n --argjson num "$1" --arg body "$2" '[{number: $num, body: $body}]' > "$PR_RESPONSE_FILE"
}

run_hook() {
  set +e
  OUT="$(HANDOFF_CHECK_SESSION_ID="$SESSION" \
    HANDOFF_CHECK_TRANSCRIPT_PATH="$TRANSCRIPT" \
    HANDOFF_CHECK_MARKER_FILE="$MARKER" \
    HANDOFF_CHECK_GH_CMD="$FAKE_GH" \
    HANDOFF_CHECK_GIT_BRANCH="$BRANCH" \
    bash "$SCRIPT" < /dev/null 2>&1)"
  EXIT_CODE=$?
  set -e
}

reset_env() {
  rm -f "$MARKER" "$PR_RESPONSE_FILE"
}

echo "=== scenario 1: PR作成/更新コマンドの形跡が無い → 沈黙 ==="
reset_env
no_pr_command_transcript
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "出力が空である"

echo "=== scenario 2: PR作成の形跡はあるがgh pr listが空配列(PR未検出) → 沈黙 ==="
reset_env
pr_command_transcript
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "出力が空である"

echo "=== scenario 3: PR本文に「後任AIへの注意」見出しがある → 沈黙 ==="
reset_env
pr_command_transcript
set_pr_response 100 $'## 概要\n内容\n\n## 後任AIへの注意\n- なし'
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "見出しがあれば沈黙する"

echo "=== scenario 4: PR本文に見出しが無い → 警告+マーカー作成 ==="
reset_env
pr_command_transcript
set_pr_response 101 '## 概要\n内容'
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0(block不可)"
assert_contains "$OUT" "systemMessage" "systemMessageフィールドがある"
assert_contains "$OUT" "PR #101" "PR番号が含まれる"
assert_contains "$OUT" "後任AIへの注意" "見出し名への言及が含まれる"
assert_eq "$([ -f "$MARKER" ] && echo yes || echo no)" "yes" "警告済みマーカーが作成される"

echo "=== scenario 5: 警告済みマーカーあり(同一セッション・同一PR) → 2回目は沈黙 ==="
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "2回目の出力は空である"

echo "=== scenario 6: 別PR番号 → 警告する ==="
set_pr_response 102 '## 概要のみ'
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_contains "$OUT" "PR #102" "別PR番号では抑止されない"

echo "=== scenario 7: transcriptが読めない → 沈黙(fail-open) ==="
reset_env
rm -f "$TRANSCRIPT"
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "判定不能時は沈黙する"

echo "=== scenario 8: jqコマンドが無い環境 → fail-open ==="
reset_env
pr_command_transcript
set_pr_response 104 '## 概要のみ'
set +e
OUT="$(HANDOFF_CHECK_SESSION_ID="$SESSION" \
  HANDOFF_CHECK_TRANSCRIPT_PATH="$TRANSCRIPT" \
  HANDOFF_CHECK_MARKER_FILE="$MARKER" \
  HANDOFF_CHECK_GH_CMD="$FAKE_GH" \
  HANDOFF_CHECK_GIT_BRANCH="$BRANCH" \
  PATH="" "$BASH_BIN" "$SCRIPT" < /dev/null 2>&1)"
EXIT_CODE=$?
set -e
assert_eq "$EXIT_CODE" "0" "exit 0(fail-open)"
assert_empty "$OUT" "出力が空である"

if [ "$fail" -ne 0 ]; then
  echo "FAILED"
  exit 1
fi
echo "ALL PASSED"
