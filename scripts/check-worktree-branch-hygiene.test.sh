#!/bin/bash
# WHY: scripts/check-worktree-branch-hygiene.sh(SessionStart hook)の回帰テスト。
# 実物のgitに依存させず、テスト用のフェイクgitをPATHの先頭に注入して決定的に検証する。
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
trap 'rm -rf "$FAKE_BIN"' EXIT
BASH_BIN="$(command -v bash)"

# $1=worktree件数 $2=branch件数
setup_fakes() {
  local worktree_count="$1" branch_count="$2"

  cat > "$FAKE_BIN/git" <<EOF
#!/bin/bash
if [ "\$1" = "worktree" ] && [ "\$2" = "list" ]; then
  for i in \$(seq 1 $worktree_count); do echo "line \$i"; done
  exit 0
fi
if [ "\$1" = "branch" ]; then
  for i in \$(seq 1 $branch_count); do echo "  branch-\$i"; done
  exit 0
fi
exit 0
EOF
  chmod +x "$FAKE_BIN/git"
}

run_hook() {
  set +e
  OUT="$(PATH="$FAKE_BIN:$PATH" "$BASH_BIN" "$SCRIPT" < /dev/null)"
  EXIT_CODE=$?
  set -e
}

echo "=== scenario 1: worktree・branchとも閾値以下 → 何も出力しない ==="
setup_fakes 2 5
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "出力が空である"

echo "=== scenario 2: worktreeが閾値超過 → 警告 ==="
setup_fakes 15 5
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_contains "$OUT" "systemMessage" "systemMessageフィールドがある"
assert_contains "$OUT" "15個" "worktree件数が含まれる"

echo "=== scenario 3: branchが閾値超過 → 警告 ==="
setup_fakes 2 20
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_contains "$OUT" "20本" "branch件数が含まれる"

echo "=== scenario 4: jqコマンドが無い環境 → fail-open ==="
setup_fakes 15 20
set +e
OUT="$(PATH="$FAKE_BIN" "$BASH_BIN" "$SCRIPT" < /dev/null 2>&1)"
EXIT_CODE=$?
set -e
assert_eq "$EXIT_CODE" "0" "exit 0(fail-open)"
assert_empty "$OUT" "出力が空である(警告は出せないがクラッシュもしない)"

if [ "$fail" -ne 0 ]; then
  echo "FAILED"
  exit 1
fi
echo "ALL PASSED"
