#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook。DBスキーマ変更はsupabase/migrations/配下のマイグレーションファイル経由に
# 限定するため、それを経由しないアドホックなSQL直接実行そのものをdenyする。
# medical-inventory-vkumaiのscripts/check-direct-ddl-execution.shを移植(issue #15)。
#
# 対象は「migrationファイルを経由しないアドホックなSQL実行」に絞る:
# - Bash経由の `supabase db execute` / `psql` 直接呼び出し
# - MCPツール経由の execute_sql系ツール(将来Supabase MCPサーバーが有効化された場合の抜け道封じ)
# - `supabase db push` はフラグ無指定時のデフォルトがリモート(本番)。--local が明示されて
#   いなければ一律denyする(「安全と証明されない限り拒否」の設計)。
#
# SQL内容の解析(DDL文かどうかの判定)はしない。コマンド/ツール自体を丸ごとdenyする。
#
# 対象ツール: Bash / mcp__*execute_sql*。.claude/settings.jsonのmatcher
# ("Bash|mcp__.*execute_sql")と本スクリプトのcase文の両方を揃える必要がある。

DIRECT_EXEC_PATTERN='(^|[;&[:space:]])(npx[[:space:]]+)?supabase[[:space:]]+db[[:space:]]+execute([[:space:]]|$)|(^|[;&[:space:]])psql([[:space:]]|$)'
DB_PUSH_PATTERN='(^|[;&[:space:]])(npx[[:space:]]+)?supabase[[:space:]]+db[[:space:]]+push([[:space:]]|$)'

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')"

DENY=0
REASON=""

case "$TOOL_NAME" in
  Bash)
    COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')"
    if [[ "$COMMAND" =~ $DIRECT_EXEC_PATTERN ]]; then
      DENY=1
      REASON="supabase db execute・psqlの直接実行はDBスキーマ変更ルール(migration経由)で禁止されています。supabase/migrations/配下にマイグレーションファイルを作成し、supabase db reset(ローカル)で適用してください。"
    elif [[ "$COMMAND" =~ $DB_PUSH_PATTERN ]] && [[ "$COMMAND" != *"--local"* ]]; then
      DENY=1
      REASON="supabase db push はフラグ無指定時のデフォルトがリモート(本番)データベースです。ローカルSupabaseへ適用する場合は明示的に --local を付けてください(例: supabase db push --local)。本番への適用が本当に必要な場合は、人間が手動で実行してください。"
    fi
    ;;
  mcp__*execute_sql*)
    DENY=1
    REASON="MCPツール経由のSQL直接実行はDBスキーマ変更ルール(migration経由)で禁止されています。supabase/migrations/配下にマイグレーションファイルを作成してください。"
    ;;
  *)
    exit 0
    ;;
esac

if [[ "$DENY" -eq 1 ]]; then
  jq -n --arg reason "$REASON" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi

exit 0
