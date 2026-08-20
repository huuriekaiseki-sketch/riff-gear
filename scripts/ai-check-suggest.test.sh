#!/bin/bash
# WHY: Stop hook(scripts/ai-check-suggest.sh)の回帰テスト。
# 実物のgit/transcriptに依存させず、テスト用の一時gitリポジトリとフェイクtranscript
# JSONLファイルを用意して決定的に検証する。
# - npm test / npm run test の両方を検知できること(issue #59 問題1)
# - 過去の警告文自体に自己マッチして警告が抑制されないこと(issue #59 問題2)
# - 未実行のまま再Stopした場合に再警告されること(issue #59 問題2)
# - jq未インストール環境はfail-open(issue #636)
#
# 実行: bash scripts/ai-check-suggest.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/ai-check-suggest.sh"

fail=0
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
assert_not_contains() {
  local haystack="$1" needle="$2" label="$3"
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    echo "  NG: $label"
    echo "      expected NOT to find: $needle"
    echo "      actual: $haystack"
    fail=1
  else
    echo "  OK: $label"
  fi
}
assert_eq() {
  local actual="$1" expected="$2" label="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  OK: $label"
  else
    echo "  NG: $label (expected=$expected actual=$actual)"
    fail=1
  fi
}

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# フェイクのgitリポジトリを用意し、ソースファイルの変更を作る
REPO_DIR="$WORKDIR/repo"
mkdir -p "$REPO_DIR/scripts" "$REPO_DIR/.claude"
cp "$SCRIPT" "$REPO_DIR/scripts/ai-check-suggest.sh"
git -C "$REPO_DIR" init -q
git -C "$REPO_DIR" config user.email test@example.com
git -C "$REPO_DIR" config user.name test
echo "export const x = 1" > "$REPO_DIR/app.ts"
git -C "$REPO_DIR" add app.ts
git -C "$REPO_DIR" commit -qm init
echo "export const x = 2" > "$REPO_DIR/app.ts"

write_transcript() {
  local path="$1"
  shift
  : > "$path"
  for cmd in "$@"; do
    jq -n --arg cmd "$cmd" '{message: {content: [{type: "tool_use", name: "Bash", input: {command: $cmd}}]}}' >> "$path"
  done
}

run_hook() {
  local session_id="$1" transcript="$2"
  local input
  input="$(jq -n --arg sid "$session_id" --arg t "$transcript" '{session_id: $sid, transcript_path: $t}')"
  set +e
  OUT="$(cd "$REPO_DIR" && printf '%s' "$input" | bash "$REPO_DIR/scripts/ai-check-suggest.sh")"
  EXIT_CODE=$?
  set -e
}

echo "=== scenario 1 (issue #59 問題1): npm test(runなし) の実行を検知できる ==="
rm -f "$REPO_DIR/.claude/.ai-check-suggest-state/"*.hash 2>/dev/null || true
TRANSCRIPT="$WORKDIR/t1.jsonl"
write_transcript "$TRANSCRIPT" "npm test"
run_hook "session-1" "$TRANSCRIPT"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_not_contains "$OUT" "実行された痕跡が見当たりません" "npm testを検知できるので警告が出ない"

echo "=== scenario 2: npm run test も検知できる ==="
rm -f "$REPO_DIR/.claude/.ai-check-suggest-state/"*.hash 2>/dev/null || true
TRANSCRIPT="$WORKDIR/t2.jsonl"
write_transcript "$TRANSCRIPT" "npm run test"
run_hook "session-2" "$TRANSCRIPT"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_not_contains "$OUT" "実行された痕跡が見当たりません" "npm run testを検知できるので警告が出ない"

echo "=== scenario 3: ai:check等が未実行なら警告する ==="
rm -f "$REPO_DIR/.claude/.ai-check-suggest-state/"*.hash 2>/dev/null || true
TRANSCRIPT="$WORKDIR/t3.jsonl"
write_transcript "$TRANSCRIPT" "ls -la"
run_hook "session-3" "$TRANSCRIPT"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_contains "$OUT" "実行された痕跡が見当たりません" "未実行なら警告が出る"

echo "=== scenario 4 (issue #59 問題2): 警告文自体が次回transcriptに含まれても自己マッチしない ==="
rm -f "$REPO_DIR/.claude/.ai-check-suggest-state/"*.hash 2>/dev/null || true
SID="session-4"
TRANSCRIPT="$WORKDIR/t4.jsonl"
# 1回目: 未実行 → 警告が出て、警告文がtranscriptに書き込まれる想定をシミュレート
write_transcript "$TRANSCRIPT" "ls -la"
run_hook "$SID" "$TRANSCRIPT"
assert_contains "$OUT" "実行された痕跡が見当たりません" "1回目: 未実行なので警告が出る"
# transcriptに前回の警告文(アシスタント発話として)を追記してから、まだコマンドは実行していない状態で再Stop
jq -n --arg msg "$OUT" '{message: {content: [{type: "text", text: $msg}]}}' >> "$TRANSCRIPT"
# ソース側にさらに変更を加えて別diff状態にする(同一ハッシュでの早期returnを避けて本題を検証する)
echo "export const x = 3" > "$REPO_DIR/app.ts"
run_hook "$SID" "$TRANSCRIPT"
assert_contains "$OUT" "実行された痕跡が見当たりません" "2回目: 警告文がtranscriptにあっても自己マッチせず再度警告が出る"

echo "=== scenario 5 (issue #59 問題2): 未実行のまま同一diff状態で再Stopすると再警告される ==="
rm -f "$REPO_DIR/.claude/.ai-check-suggest-state/"*.hash 2>/dev/null || true
SID="session-5"
TRANSCRIPT="$WORKDIR/t5.jsonl"
echo "export const x = 4" > "$REPO_DIR/app.ts"
write_transcript "$TRANSCRIPT" "ls -la"
run_hook "$SID" "$TRANSCRIPT"
assert_contains "$OUT" "実行された痕跡が見当たりません" "1回目: 未実行なので警告が出る"
run_hook "$SID" "$TRANSCRIPT"
assert_contains "$OUT" "実行された痕跡が見当たりません" "2回目(同一diff・未実行のまま): ハッシュが書き込まれていないので再警告される"

echo "=== scenario 6: 実行確認後は同一diff状態で再Stopしても警告しない(ハッシュキャッシュが効く) ==="
rm -f "$REPO_DIR/.claude/.ai-check-suggest-state/"*.hash 2>/dev/null || true
SID="session-6"
TRANSCRIPT="$WORKDIR/t6.jsonl"
echo "export const x = 5" > "$REPO_DIR/app.ts"
write_transcript "$TRANSCRIPT" "npm test"
run_hook "$SID" "$TRANSCRIPT"
assert_not_contains "$OUT" "実行された痕跡が見当たりません" "1回目: 実行済みなので警告なし"
run_hook "$SID" "$TRANSCRIPT"
assert_not_contains "$OUT" "実行された痕跡が見当たりません" "2回目(同一diff): ハッシュキャッシュにより早期returnで警告なし"

echo "=== scenario 7: ドキュメントのみの変更は対象外 ==="
rm -f "$REPO_DIR/.claude/.ai-check-suggest-state/"*.hash 2>/dev/null || true
git -C "$REPO_DIR" add -A
git -C "$REPO_DIR" commit -qm "wip from earlier scenarios"
echo "# note" > "$REPO_DIR/README.md"
git -C "$REPO_DIR" add README.md
TRANSCRIPT="$WORKDIR/t7.jsonl"
write_transcript "$TRANSCRIPT" "ls -la"
run_hook "session-7" "$TRANSCRIPT"
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_not_contains "$OUT" "実行された痕跡が見当たりません" "ドキュメント変更のみなら警告しない"
git -C "$REPO_DIR" reset -q

echo "=== scenario 8 (issue #636): jq未インストール環境 → fail-open(exit 0、警告なし) ==="
TRANSCRIPT="$WORKDIR/t8.jsonl"
write_transcript "$TRANSCRIPT" "ls -la"
input="$(jq -n --arg t "$TRANSCRIPT" '{session_id: "session-8", transcript_path: $t}')"
set +e
OUT="$(cd "$REPO_DIR" && printf '%s' "$input" | PATH="" /bin/bash "$REPO_DIR/scripts/ai-check-suggest.sh" 2>&1)"
EXIT_CODE=$?
set -e
assert_eq "$EXIT_CODE" "0" "exit 0(fail-open)"

if [ "$fail" -ne 0 ]; then
  echo "FAILED"
  exit 1
fi
echo "ALL PASSED"
