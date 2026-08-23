#!/usr/bin/env bash
set -euo pipefail

# Codex Stop hook。PostToolUse hookが記録したdiffハッシュを参照し、
# ソース変更後に品質チェックが未実行なら警告する。
if ! command -v jq >/dev/null 2>&1; then
  echo '{"systemMessage": ""}'
  exit 0
fi

cd "$(dirname "$0")/.."

INPUT="$(cat)"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')"
STATE_DIR=".codex/.ai-check-suggest-state"
STATE_FILE="$STATE_DIR/${SESSION_ID}.hash"
mkdir -p "$STATE_DIR"
find "$STATE_DIR" -name '*.hash' -mtime +7 -delete 2>/dev/null || true

SOURCE_STATUS="$(git status --porcelain -- '*.ts' '*.tsx' '*.sql' 2>/dev/null || true)"
if [[ -z "$SOURCE_STATUS" ]]; then
  echo '{"systemMessage": ""}'
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
RECORDED_HASH=""
if [[ -f "$STATE_FILE" ]]; then
  RECORDED_HASH="$(cat "$STATE_FILE")"
fi

if [[ "$RECORDED_HASH" == "$CURRENT_HASH" ]]; then
  echo '{"systemMessage": ""}'
  exit 0
fi

MSG="ソースコード変更(.ts/.tsx/.sql)があるにもかかわらず、このCodexセッションで npm run ai:check 相当のコマンド(typecheck/lint/test)が実行された痕跡が見当たりません。実行を検討してください。"
jq -n --arg msg "$MSG" '{systemMessage: $msg}'
