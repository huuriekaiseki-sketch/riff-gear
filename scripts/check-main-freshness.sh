#!/usr/bin/env bash
set -euo pipefail

# SessionStart hook。ローカルのmainブランチがorigin/mainと乖離していないかを確認する。
#
# WHY(2026-08-29): トップレベルの作業ディレクトリのローカルmainが、いつの間にか
# origin/mainと共通の祖先を持たない状態(unrelated histories)になっていた実例が発生。
# 担当者は古いローカルmain上で作業し、「アプリ側の機能が未実装」というレビュー指摘を
# 裏取りせず信じてしまい、実際は既にorigin/mainで解決済みの内容を二重実装した
# (誤診断→PR #115での訂正につながった)。check-branch-pr-status.shはmainを対象外
# にしているため、この種の乖離は検知対象外だった。
#
# 単なる「pullすれば追いつく」遅れと、「共通祖先が無い」重大な乖離を区別して警告する。
command -v jq >/dev/null 2>&1 || exit 0

cd "$(dirname "$0")/.."

BRANCH="$(git branch --show-current 2>/dev/null || true)"

if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  exit 0
fi

git fetch origin "$BRANCH" --quiet 2>/dev/null || exit 0

LOCAL_HEAD="$(git rev-parse HEAD 2>/dev/null || true)"
REMOTE_HEAD="$(git rev-parse "origin/$BRANCH" 2>/dev/null || true)"

if [ -z "$LOCAL_HEAD" ] || [ -z "$REMOTE_HEAD" ] || [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
  exit 0
fi

if git merge-base "$LOCAL_HEAD" "$REMOTE_HEAD" >/dev/null 2>&1; then
  # 共通祖先はあるが遅れている(ancestor関係かどうかは問わない、squash運用では
  # 素直なfast-forward判定が効かないため「一致していない」ことだけで軽く警告する)。
  MSG="ローカルの${BRANCH}ブランチがorigin/${BRANCH}と一致していません。着手前に \`git fetch origin ${BRANCH}\` → \`git reset --hard origin/${BRANCH}\`(未コミット変更が無いことを確認の上)で最新化することを推奨します。古いローカル${BRANCH}を見て「まだ未実装」と誤診断し、既にマージ済みの機能を重複実装するリスクがあります。"
else
  # 共通祖先が無い(unrelated histories)。古い方を捨てる前提の重大警告。
  MSG="【重大】ローカルの${BRANCH}ブランチが、origin/${BRANCH}と共通の履歴を持たない状態(unrelated histories)です。過去に実際にこの状態から「既にマージ済みの機能を未実装と誤診断して二重実装する」事故が発生しました(docs/agents/known-failure-patterns.md参照)。作業前に \`git status\` で未コミット変更の有無を確認し、価値のある変更が無ければ \`git fetch origin ${BRANCH}\` → \`git reset --hard origin/${BRANCH}\` でローカル${BRANCH}を復旧してください。"
fi

jq -n --arg msg "$MSG" '{
  systemMessage: $msg,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $msg
  }
}'
