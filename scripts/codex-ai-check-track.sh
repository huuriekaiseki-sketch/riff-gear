#!/usr/bin/env bash
set -euo pipefail

# Codex PostToolUse hook。安定したhook入力から品質チェックコマンドの実行を記録し、
# Stop hookがCodexの不安定なtranscript形式を解析しなくて済むようにする。
command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')"

if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

CHECK_PATTERN='npm[[:space:]]+(run[[:space:]]+)?(ai:check|typecheck|lint|test)\b|npx[[:space:]]+(vitest|tsc)\b'
if ! printf '%s' "$COMMAND" | grep -qE "$CHECK_PATTERN"; then
  exit 0
fi

cd "$(dirname "$0")/.."

SOURCE_STATUS="$(git status --porcelain -- '*.ts' '*.tsx' '*.sql' 2>/dev/null || true)"
if [[ -z "$SOURCE_STATUS" ]]; then
  exit 0
fi

CURRENT_HASH="$({
  printf '%s\n' "$SOURCE_STATUS"
  git diff --binary HEAD -- '*.ts' '*.tsx' '*.sql'
  while IFS= read -r -d '' file; do
    printf 'untracked:%s\n' "$file"
    shasum -a 256 -- "$file"
  done < <(git ls-files --others --exclude-standard -z -- '*.ts' '*.tsx' '*.sql')
} | shasum -a 256 | awk '{print $1}')"
STATE_DIR=".codex/.ai-check-suggest-state"
STATE_FILE="$STATE_DIR/${SESSION_ID}.hash"
mkdir -p "$STATE_DIR"
find "$STATE_DIR" -name '*.hash' -mtime +7 -delete 2>/dev/null || true
printf '%s\n' "$CURRENT_HASH" > "$STATE_FILE"
