#!/usr/bin/env bash
set -euo pipefail

# WHY: 警告専用(ブロックしない)hookである。jq/gh未インストール環境では
# 呼び出しがexit 127でスクリプトごと死に、警告が出せなくなる(check-branch-pr-status.sh
# と同じ設計)ため、不在時は静かにexit 0する。
#
# WHY(2026-08-29): 「Write/Editが反映されない」という誤診断インシデントの根本原因は、
# トップレベル作業ディレクトリのローカルmainがorigin/mainと乖離していたことだったが、
# それに気づく前に前セッションはPR無しで作業を終えており、後続セッションが
# ゼロから調査するしかなかった。PR本文に「後任AIへの注意」(この変更固有の
# 壊してはいけない前提・紛らわしい別物・触らない場所)が無いと、同じ調査コストを
# 毎回払うことになる。docs/agents/known-failure-patterns.mdへの追記だけでは
# 「書いたことを忘れる/次のセッションが読む前提を知らない」問題を解決できないため、
# PR本文という「次のセッションが必ず見る場所」に機械的に存在確認する。
#
# 検知ロジック:
# 1. transcriptを軽くgrepし、このセッションで`gh pr create`/`gh pr edit`が呼ばれた
#    形跡があるかを確認する。無ければ「PR操作なしセッション」として沈黙する
# 2. 形跡があれば、現在のブランチに紐づく直近PRを`gh pr list`で取得する
# 3. PR本文に「## 後任AIへの注意」見出しが含まれるかを確認する(部分文字列一致)
# 4. 無ければ警告する(同一セッション・同一PR番号につき1回のみ)
#
# 環境変数(テスト用の注入ポイント):
#   HANDOFF_CHECK_SESSION_ID       hook stdinのsession_idの代替
#   HANDOFF_CHECK_TRANSCRIPT_PATH  hook stdinのtranscript_pathの代替
#   HANDOFF_CHECK_MARKER_FILE      警告済みマーカー(既定 .claude/.handoff-format-warning-shown.json)
#   HANDOFF_CHECK_GH_CMD           `gh`コマンドの代替(テスト用フェイク)
#   HANDOFF_CHECK_GIT_BRANCH       現在ブランチの代替

# WHY: jq不在時にdirname呼び出し(次の行)より前でガードする。dirname自体が
# 使えない極小環境でも、jqガードで先に抜けられるようにするため
# (check-branch-pr-status.shと同じ設計)。
command -v jq >/dev/null 2>&1 || exit 0

cd "$(dirname "$0")/.."

MARKER_FILE="${HANDOFF_CHECK_MARKER_FILE:-.claude/.handoff-format-warning-shown.json}"
GH_CMD="${HANDOFF_CHECK_GH_CMD:-gh}"

command -v "$GH_CMD" >/dev/null 2>&1 || exit 0

HOOK_INPUT=""
if [ -z "${HANDOFF_CHECK_SESSION_ID:-}" ] || [ -z "${HANDOFF_CHECK_TRANSCRIPT_PATH:-}" ]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
fi
SESSION_ID="${HANDOFF_CHECK_SESSION_ID:-$(printf '%s' "$HOOK_INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)}"
TRANSCRIPT_PATH="${HANDOFF_CHECK_TRANSCRIPT_PATH:-$(printf '%s' "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || true)}"

[ -n "$SESSION_ID" ] || exit 0
[ -n "$TRANSCRIPT_PATH" ] || exit 0
[ -f "$TRANSCRIPT_PATH" ] || exit 0

# 1. PR作成/更新の形跡が無ければ沈黙(最頻経路。gh呼び出し自体を避ける)
if ! grep -qF -e '"command":"gh pr create' -e '"command":"gh pr edit' "$TRANSCRIPT_PATH" 2>/dev/null; then
  exit 0
fi

# 2. 現在のブランチに紐づく直近PRを取得
BRANCH="${HANDOFF_CHECK_GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"
[ -n "$BRANCH" ] || exit 0

PR_JSON="$("$GH_CMD" pr list --head "$BRANCH" --state all --json number,body --limit 1 2>/dev/null || true)"
[ -n "$PR_JSON" ] || exit 0

PR_NUMBER="$(printf '%s' "$PR_JSON" | jq -r '.[0].number // empty' 2>/dev/null || true)"
PR_BODY="$(printf '%s' "$PR_JSON" | jq -r '.[0].body // empty' 2>/dev/null || true)"
[ -n "$PR_NUMBER" ] || exit 0

# 警告済みマーカー: 同一セッション・同一PR番号では2回目以降沈黙
if [ -f "$MARKER_FILE" ]; then
  WARNED_KEY="$(jq -r '.key // empty' "$MARKER_FILE" 2>/dev/null || true)"
  if [ "$WARNED_KEY" = "${SESSION_ID}:${PR_NUMBER}" ]; then
    exit 0
  fi
fi

if printf '%s' "$PR_BODY" | grep -qF '後任AIへの注意'; then
  exit 0
fi

write_marker() {
  local dir tmp
  dir="$(dirname "$MARKER_FILE")"
  mkdir -p "$dir" 2>/dev/null || return 1
  tmp="$(mktemp "$dir/.handoff-format-warning.XXXXXX" 2>/dev/null)" || return 1
  jq -n --arg key "${SESSION_ID}:${PR_NUMBER}" '{key: $key}' > "$tmp" 2>/dev/null || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$MARKER_FILE" 2>/dev/null || { rm -f "$tmp"; return 1; }
  return 0
}
set +e
write_marker
set -e

MSG="PR #${PR_NUMBER} の本文に「## 後任AIへの注意」見出しが見当たりません。この変更固有の壊してはいけない前提・紛らわしい別物・勝手にリファクタしない場所を書き残してください(無ければ「なし」でよい)。次にこのコードに触るセッションが同じ調査コストを払わずに済むようにするためです(この警告はこのPRにつき1回のみ表示されます)。"
jq -n --arg msg "$MSG" '{systemMessage: $msg}'

exit 0
