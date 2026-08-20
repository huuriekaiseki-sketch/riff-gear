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
#
# WHY(issue #636): denyゲートはガード自身が壊れた時にfail-closed(ブロック)であるべき。
# jq未インストール環境でset -euo pipefail下でjqを呼ぶとexit 127でスクリプトごと死に、
# denyゲートが無音で無効化されてしまう。jq不在を明示的に検知しexit 2(ブロック)で止める。
command -v jq >/dev/null 2>&1 || { echo "jq not found: DDL guard cannot run" >&2; exit 2; }

# WHY(issue #57・#58): 単一の巨大な正規表現でコマンド全体を検査すると、
# ; & | や $( ) でつながれた複数コマンドの境界を正しく扱えない
# (パイプ・コマンド置換ですり抜けられる／別セグメントの--localで誤って許可される)。
# ; & | && || を区切り文字としてコマンドをセグメントに分割し、セグメントごとに判定する。
split_segments() {
  printf '%s\n' "$1" | sed -E 's/(\|\||&&|[;&|])/\n/g'
}

# 「psql」「supabase db execute」がセグメント内に単語として現れるか。
# 先頭に任意のパス(/usr/bin/psql等)が付いていてもよい。
DIRECT_EXEC_SEG_PATTERN='(^|[[:space:](])(npx[[:space:]]+)?supabase[[:space:]]+db[[:space:]]+execute([[:space:]]|$)|(^|[[:space:](])([[:alnum:]_./-]*/)?psql([[:space:]]|$)'
DB_PUSH_SEG_PATTERN='(^|[[:space:](])(npx[[:space:]]+)?supabase[[:space:]]+db[[:space:]]+push([[:space:]]|$)'
# セグメントが読み取り専用コマンド(which/man/type/grep)で始まる場合は対象外とする
# (issue #57: `which psql`のような読み取り系コマンドの誤denyを避ける)。
READONLY_SEG_PATTERN='^[[:space:]]*(which|man|type)[[:space:]]+psql([[:space:]]|$)|^[[:space:]]*(git[[:space:]]+grep|grep)[[:space:]]'

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')"

DENY=0
REASON=""

case "$TOOL_NAME" in
  Bash)
    COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')"
    while IFS= read -r seg; do
      if [[ "$seg" =~ $READONLY_SEG_PATTERN ]]; then
        continue
      fi
      if [[ "$seg" =~ $DIRECT_EXEC_SEG_PATTERN ]]; then
        DENY=1
        REASON="supabase db execute・psqlの直接実行はDBスキーマ変更ルール(migration経由)で禁止されています。supabase/migrations/配下にマイグレーションファイルを作成し、supabase db reset(ローカル)で適用してください。"
        break
      fi
      if [[ "$seg" =~ $DB_PUSH_SEG_PATTERN ]] && [[ "$seg" != *"--local"* ]]; then
        DENY=1
        REASON="supabase db push はフラグ無指定時のデフォルトがリモート(本番)データベースです。ローカルSupabaseへ適用する場合は明示的に --local を付けてください(例: supabase db push --local)。本番への適用が本当に必要な場合は、人間が手動で実行してください。"
        break
      fi
    done < <(split_segments "$COMMAND")
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
