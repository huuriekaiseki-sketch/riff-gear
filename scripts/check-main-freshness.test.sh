#!/bin/bash
# WHY: scripts/check-main-freshness.sh(SessionStart hook)の回帰テスト。
# 実物のgitに依存させず、テスト用のフェイクgitをPATHの先頭に注入して決定的に検証する。
#
# 実行: bash scripts/check-main-freshness.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-main-freshness.sh"

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

# $1=branch $2=fetch_ok(1/0) $3=local_head $4=remote_head $5=merge_base_ok(1/0)
setup_fakes() {
  local branch="$1" fetch_ok="$2" local_head="$3" remote_head="$4" merge_base_ok="$5"

  cat > "$FAKE_BIN/git" <<EOF
#!/bin/bash
case "\$1 \$2" in
  "branch --show-current")
    echo "$branch"
    exit 0
    ;;
esac
case "\$1" in
  fetch)
    [ "$fetch_ok" = "1" ] && exit 0 || exit 1
    ;;
  rev-parse)
    case "\$2" in
      HEAD) echo "$local_head" ;;
      *) echo "$remote_head" ;;
    esac
    exit 0
    ;;
  merge-base)
    [ "$merge_base_ok" = "1" ] && exit 0 || exit 1
    ;;
esac
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

echo "=== scenario 1: mainではないブランチ → 何も出力しない ==="
setup_fakes "feature/foo" 1 aaa bbb 1
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "出力が空である"

echo "=== scenario 2: mainだがfetch失敗(オフライン等) → fail-open ==="
setup_fakes "main" 0 aaa bbb 1
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "出力が空である"

echo "=== scenario 3: mainでorigin/mainと完全一致 → 何も出力しない ==="
setup_fakes "main" 1 samehash samehash 1
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_empty "$OUT" "出力が空である"

echo "=== scenario 4: mainが遅れているだけ(共通祖先あり) → 軽い警告 ==="
setup_fakes "main" 1 aaa bbb 1
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_contains "$OUT" "systemMessage" "systemMessageフィールドがある"
assert_contains "$OUT" "一致していません" "軽い警告文言が含まれる"

echo "=== scenario 5: mainがunrelated histories(共通祖先なし) → 重大警告 ==="
setup_fakes "main" 1 aaa bbb 0
run_hook
assert_eq "$EXIT_CODE" "0" "exit 0"
assert_contains "$OUT" "重大" "重大警告の文言が含まれる"
assert_contains "$OUT" "unrelated histories" "unrelated historiesの説明が含まれる"

echo "=== scenario 6: jqコマンドが無い環境 → fail-open ==="
setup_fakes "main" 1 aaa bbb 0
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
