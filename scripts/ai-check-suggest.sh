#!/usr/bin/env bash
set -euo pipefail

# Stop hookから呼ばれる。セッション中にnpm run ai:check相当(typecheck/lint/test)が
# 実行されたかをtranscriptから機械的に検査し、ソース変更があるのに未実行なら
# systemMessageで警告する。
# medical-inventory-vkumaiのscripts/ai-check-suggest.shを移植(issue #15)。

# WHY(issue #636): 警告専用hookのためjq不在時はfail-open(exit 0で静かに諦める)。
# dirname呼び出し(次のcd)より前に置く。jqが無い＝coreutils自体も期待できない
# 極小環境の可能性があるため、外部コマンド(cat等)を呼ばずbuiltinのみで抜ける。
if ! command -v jq >/dev/null 2>&1; then
  echo '{"systemMessage": ""}'
  exit 0
fi

cd "$(dirname "$0")/.."

INPUT="$(cat)"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')"
TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""')"

STATE_DIR=".claude/.ai-check-suggest-state"
mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/${SESSION_ID}.hash"

# 7日より古い状態ファイルは掃除する(セッションごとに増え続けるのを防ぐ)
find "$STATE_DIR" -name '*.hash' -mtime +7 -delete 2>/dev/null || true

CHANGED_FILES="$( { git diff --name-only HEAD; git status --porcelain | awk '{print $2}'; } 2>/dev/null || true)"
CURRENT_HASH="$(printf '%s' "$CHANGED_FILES" | shasum -a 256 | awk '{print $1}')"

# ソースコード変更(ドキュメント・設定のみの変更は対象外)がなければチェック不要
if ! printf '%s' "$CHANGED_FILES" | grep -qE '\.(ts|tsx|sql)$'; then
  echo '{"systemMessage": ""}'
  exit 0
fi

if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  echo '{"systemMessage": ""}'
  exit 0
fi

# WHY(issue #59 問題2): transcript全文をgrepすると、過去に出した自分の警告文
# ("npm run ai:check"という文字列を含む)自体にマッチしてしまい、一度警告が出ると
# 以降のStopで「実行済み」と誤判定され警告が自己抑制される。
# 実際にBashツールで実行されたコマンド(tool_use.input.command)だけを抽出して
# 検査対象にすることで、会話文中の言及や過去の警告文とは区別する。
EXECUTED_COMMANDS="$(jq -r '
  select(.message.content != null)
  | .message.content[]?
  | select(.type == "tool_use" and .name == "Bash")
  | .input.command // empty
' "$TRANSCRIPT" 2>/dev/null || true)"

# WHY(issue #59 問題1): このリポジトリの標準テストコマンドは`npm test`だが、
# 旧パターンは`npm run ...`形式のみマッチしていたため誤警告していた。
# `npm test`・`npm run test`のどちらも拾えるようにする。
CHECK_PATTERN='npm[[:space:]]+(run[[:space:]]+)?(ai:check|typecheck|lint|test)\b|npx[[:space:]]+(vitest|tsc)\b'

if printf '%s' "$EXECUTED_COMMANDS" | grep -qE "$CHECK_PATTERN"; then
  # WHY(issue #59 問題2): ハッシュ書き込みを「実行確認できた場合のみ」に限定する。
  # 未実行のまま同一diff状態で再Stopした場合に再警告されるようにするため。
  echo "$CURRENT_HASH" > "$STATE_FILE"
  echo '{"systemMessage": ""}'
else
  MSG="ソースコード変更(.ts/.tsx/.sql)があるにもかかわらず、このセッションで npm run ai:check 相当のコマンド(typecheck/lint/test)が実行された痕跡が見当たりません。実行を検討してください。"
  jq -n --arg msg "$MSG" '{systemMessage: $msg}'
fi
