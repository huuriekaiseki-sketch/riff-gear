#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook。`vercel env rm`(`remove`)は環境を1つ指定して実行しても、
# その変数エントリを全環境ぶん丸ごと削除する(2026-08-21、riff-gearの
# SUPABASE_SERVICE_ROLE_KEYをPreviewからだけ外すつもりでProductionごと
# 削除してしまった事故が実際に発生)。Sensitive設定の変数は一度削除すると
# CLI/APIから値を読み戻せないため、実行前に必ず人間の確認を挟む。
#
# WHY: jq未インストール環境でset -euo pipefail下でjqを呼ぶとexit 127で
# スクリプトごと死に、ガードが無音で無効化される。jq不在を明示的に検知し
# exit 2(ブロック)で止める(check-direct-ddl-execution.shと同じ設計)。
command -v jq >/dev/null 2>&1 || { echo "jq not found: vercel env guard cannot run" >&2; exit 2; }

split_segments() {
  printf '%s\n' "$1" | sed -E 's/(\|\||&&|[;&|])/\n/g'
}

# 「vercel env rm」「vercel env remove」がセグメント内に単語として現れるか。
# npx/pnpm dlx/yarn dlx経由の呼び出しも対象にする。
VERCEL_ENV_RM_PATTERN='(^|[[:space:](])((npx|pnpm[[:space:]]+dlx|yarn[[:space:]]+dlx)[[:space:]]+)?vercel[[:space:]]+env[[:space:]]+(rm|remove)([[:space:]]|$)'

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')"
HOOK_RUNTIME="${1:-claude}"

if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')"

while IFS= read -r seg; do
  if [[ "$seg" =~ $VERCEL_ENV_RM_PATTERN ]]; then
    DECISION="ask"
    if [[ "$HOOK_RUNTIME" == "codex" ]]; then
      DECISION="deny"
    fi

    jq -n --arg decision "$DECISION" \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $decision, permissionDecisionReason: "vercel env rm/removeは環境を1つ指定しても変数を全環境ぶん丸ごと削除します(2026-08-21にriff-gearのSUPABASE_SERVICE_ROLE_KEYで実際に事故発生・Production分も消えた)。Sensitive変数は削除後に値を読み戻せないため復元不可です。本当に全環境から削除する意図か確認してください。特定の環境からだけ外したい場合はVercelダッシュボードで対象環境のチェックを外してください。"}}'
    exit 0
  fi
done < <(split_segments "$COMMAND")

exit 0
