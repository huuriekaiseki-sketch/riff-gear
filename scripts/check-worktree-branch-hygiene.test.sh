#!/bin/bash
# WHY: scripts/check-worktree-branch-hygiene.sh(SessionStart hook)の回帰テスト。
# 実物のgit/ghに依存させず、テスト用のフェイクをPATHの先頭に注入して決定的に検証する。
#
# 実行: bash scripts/check-worktree-branch-hygiene.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-worktree-branch-hygiene.sh"

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
    echo "  NG: $label (unexpectedly found: $needle)"
    fail=1
  else
    echo "  OK: $label"
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
assert_eq() {
  local actual="$1" expected="$2" label="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  OK: $label"
  else
    echo "  NG: $label (expected=$expected actual=$actual)"
    fail=1
  fi
}

FAKE_BIN="$(mktemp -d)"
CALL_LOG="$(mktemp)"
trap 'rm -rf "$FAKE_BIN" "$CALL_LOG"' EXIT
BASH_BIN="$(command -v bash)"

# フェイクgit: 閾値判定・porcelain一覧・削除系コマンドをまとめて偽装する。
# 環境変数で挙動を制御する:
#   WT_COUNT / BR_COUNT: 閾値判定用のカウント
#   CURRENT_BRANCH: git branch --show-current の返り値
#   BRANCH_LIST: git branch --format=... で返すブランチ名(改行区切り)
#   PORCELAIN: git worktree list --porcelain の出力
#   DIRTY_PATHS: 未コミット変更ありとして扱うworktreeパス(スペース区切り)
setup_fake_git() {
  cat > "$FAKE_BIN/git" <<'GITEOF'
#!/bin/bash
CALL_LOG_FILE="__CALL_LOG__"
if [ "$1" = "worktree" ] && [ "$2" = "list" ] && [ "$3" = "--porcelain" ]; then
  printf '%s\n' "$PORCELAIN"
  exit 0
fi
if [ "$1" = "worktree" ] && [ "$2" = "list" ]; then
  for i in $(seq 1 "${WT_COUNT:-1}"); do echo "line $i"; done
  exit 0
fi
if [ "$1" = "worktree" ] && [ "$2" = "remove" ]; then
  echo "worktree remove $3" >> "$CALL_LOG_FILE"
  exit 0
fi
if [ "$1" = "branch" ] && [ "$2" = "--show-current" ]; then
  printf '%s' "${CURRENT_BRANCH:-}"
  exit 0
fi
if [ "$1" = "branch" ] && [[ "$2" == --format=* ]]; then
  printf '%s\n' "$BRANCH_LIST"
  exit 0
fi
if [ "$1" = "branch" ] && [ "$2" = "-D" ]; then
  echo "branch -D $3" >> "$CALL_LOG_FILE"
  exit 0
fi
if [ "$1" = "branch" ]; then
  for i in $(seq 1 "${BR_COUNT:-1}"); do echo "  branch-$i"; done
  exit 0
fi
if [ "$1" = "-C" ]; then
  wt_path="$2"
  for dp in $DIRTY_PATHS; do
    if [ "$dp" = "$wt_path" ]; then
      echo "M some-file"
      exit 0
    fi
  done
  exit 0
fi
exit 0
GITEOF
  sed -i.bak "s#__CALL_LOG__#$CALL_LOG#" "$FAKE_BIN/git"
  rm -f "$FAKE_BIN/git.bak"
  chmod +x "$FAKE_BIN/git"
}

# フェイクgh: ブランチ名ごとのPR状態をGH_PR_STATE_<branch>形式の環境変数で切り替える。
setup_fake_gh() {
  cat > "$FAKE_BIN/gh" <<'GHEOF'
#!/bin/bash
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  branch="$4"
  var="GH_STATE_$(echo "$branch" | tr '/-' '__')"
  state="${!var:-}"
  if [ -z "$state" ]; then
    echo '[]'
  else
    echo "[{\"state\":\"$state\",\"number\":1}]"
  fi
  exit 0
fi
exit 0
GHEOF
  chmod +x "$FAKE_BIN/gh"
}

setup_fake_git
setup_fake_gh
: > "$CALL_LOG"

run_hook() {
  set +e
  OUT="$(PATH="$FAKE_BIN:$PATH" \
    WT_COUNT="${WT_COUNT:-1}" BR_COUNT="${BR_COUNT:-1}" \
    CURRENT_BRANCH="${CURRENT_BRANCH:-}" BRANCH_LIST="${BRANCH_LIST:-}" \
    PORCELAIN="${PORCELAIN:-}" DIRTY_PATHS="${DIRTY_PATHS:-}" \
    "$BASH_BIN" "$SCRIPT" < /dev/null)"
  EXIT_CODE=$?
  set -e
}

echo "=== scenario 1: worktree・branchとも閾値以下 → 何もしない ==="
WT_COUNT=2 BR_COUNT=5 CURRENT_BRANCH="main" BRANCH_LIST="" PORCELAIN="" DIRTY_PATHS=""
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "出力が空である"
assert_empty "$(cat "$CALL_LOG")" "削除系コマンドが呼ばれない"

echo "=== scenario 2: 閾値超過・マージ済みPRのブランチを自動削除 ==="
: > "$CALL_LOG"
export GH_STATE_claude_merged_feature="MERGED"
WT_COUNT=15 BR_COUNT=20 CURRENT_BRANCH="claude/current-work" \
  BRANCH_LIST=$'claude/current-work\nclaude/merged-feature' \
  PORCELAIN=$'worktree /repo\nbranch refs/heads/claude/current-work\n\nworktree /repo/.claude/worktrees/merged-feature\nbranch refs/heads/claude/merged-feature' \
  DIRTY_PATHS=""
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_contains "$OUT" "claude/merged-feature" "削除済みリストにブランチ名が含まれる"
assert_contains "$(cat "$CALL_LOG")" "worktree remove /repo/.claude/worktrees/merged-feature" "worktree removeが呼ばれる"
assert_contains "$(cat "$CALL_LOG")" "branch -D claude/merged-feature" "branch -Dが呼ばれる"
unset GH_STATE_claude_merged_feature

echo "=== scenario 3: 現在のブランチは削除対象から除外 ==="
: > "$CALL_LOG"
export GH_STATE_claude_current_work="MERGED"
WT_COUNT=15 BR_COUNT=20 CURRENT_BRANCH="claude/current-work" \
  BRANCH_LIST="claude/current-work" \
  PORCELAIN=$'worktree /repo\nbranch refs/heads/claude/current-work' \
  DIRTY_PATHS=""
run_hook
assert_empty "$(cat "$CALL_LOG")" "現在のブランチには削除系コマンドが呼ばれない"
unset GH_STATE_claude_current_work

echo "=== scenario 4: 未コミット変更ありのworktreeはスキップ ==="
: > "$CALL_LOG"
export GH_STATE_claude_dirty_feature="MERGED"
WT_COUNT=15 BR_COUNT=20 CURRENT_BRANCH="claude/current-work" \
  BRANCH_LIST=$'claude/current-work\nclaude/dirty-feature' \
  PORCELAIN=$'worktree /repo\nbranch refs/heads/claude/current-work\n\nworktree /repo/.claude/worktrees/dirty-feature\nbranch refs/heads/claude/dirty-feature' \
  DIRTY_PATHS="/repo/.claude/worktrees/dirty-feature"
run_hook
assert_empty "$(cat "$CALL_LOG")" "未コミット変更ありのブランチは削除されない"
assert_contains "$OUT" "claude/dirty-feature" "スキップ理由に含まれる"
unset GH_STATE_claude_dirty_feature

echo "=== scenario 5: OPEN PRのブランチはスキップ ==="
: > "$CALL_LOG"
export GH_STATE_claude_open_feature="OPEN"
WT_COUNT=15 BR_COUNT=20 CURRENT_BRANCH="claude/current-work" \
  BRANCH_LIST=$'claude/current-work\nclaude/open-feature' \
  PORCELAIN="" DIRTY_PATHS=""
run_hook
assert_empty "$(cat "$CALL_LOG")" "OPENのブランチは削除されない"
assert_contains "$OUT" "claude/open-feature" "OPENスキップ理由に含まれる"
unset GH_STATE_claude_open_feature

echo "=== scenario 6: 対応PRが見つからないブランチはスキップ(手動確認扱い) ==="
: > "$CALL_LOG"
WT_COUNT=15 BR_COUNT=20 CURRENT_BRANCH="claude/current-work" \
  BRANCH_LIST=$'claude/current-work\nclaude/no-pr-feature' \
  PORCELAIN="" DIRTY_PATHS=""
run_hook
assert_empty "$(cat "$CALL_LOG")" "PR不明のブランチは削除されない"
assert_contains "$OUT" "claude/no-pr-feature" "手動確認リストに含まれる"

echo "=== scenario 7: jqコマンドが無い環境 → fail-open ==="
: > "$CALL_LOG"
FAKE_BIN_NO_JQ="$(mktemp -d)"
cp "$FAKE_BIN/git" "$FAKE_BIN_NO_JQ/git"
cp "$FAKE_BIN/gh" "$FAKE_BIN_NO_JQ/gh"
set +e
OUT="$(PATH="$FAKE_BIN_NO_JQ" WT_COUNT=15 BR_COUNT=20 CURRENT_BRANCH="claude/current-work" BRANCH_LIST="" PORCELAIN="" DIRTY_PATHS="" "$BASH_BIN" "$SCRIPT" < /dev/null 2>&1)"
EXIT_CODE=$?
set -e
rm -rf "$FAKE_BIN_NO_JQ"
assert_eq "$EXIT_CODE" "0" "exit 0(fail-open, jqなし)"
assert_empty "$OUT" "出力が空である(クラッシュしない)"

if [ "$fail" -ne 0 ]; then
  echo "FAILED"
  exit 1
fi
echo "ALL PASSED"
