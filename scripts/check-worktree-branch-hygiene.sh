#!/usr/bin/env bash
set -euo pipefail

# SessionStart hook。worktree数・ローカルブランチ数が閾値を超えたら棚卸しを促す。
#
# WHY(2026-08-29): git worktreeとローカルブランチはPRがマージされても自動では
# 消えない(delete_branch_on_mergeはリモートブランチのみが対象)ため、セッションを
# 重ねるほどローカルに残骸が蓄積する。実際に24個のworktreeと約30本の孤立ブランチが
# 放置されていた。削除の自動化は破壊的操作なので行わず、閾値超過時に
# 「棚卸しを検討してください」と気づかせるだけに留める。
command -v jq >/dev/null 2>&1 || exit 0

cd "$(dirname "$0")/.."

WORKTREE_THRESHOLD=10
BRANCH_THRESHOLD=15

WORKTREE_COUNT="$(git worktree list 2>/dev/null | wc -l | tr -d ' ')"
BRANCH_COUNT="$(git branch 2>/dev/null | wc -l | tr -d ' ')"

if [ "$WORKTREE_COUNT" -le "$WORKTREE_THRESHOLD" ] && [ "$BRANCH_COUNT" -le "$BRANCH_THRESHOLD" ]; then
  exit 0
fi

MSG="ローカルのworktree(${WORKTREE_COUNT}個)・ブランチ(${BRANCH_COUNT}本)が閾値(worktree:${WORKTREE_THRESHOLD}/branch:${BRANCH_THRESHOLD})を超えています。マージ済みPRに対応するworktree・ブランチが放置されている可能性があります。\`gh pr list --head <branch> --state all\` でPR状態を確認し、マージ済みのものは \`git worktree remove\` → \`git branch -D\` で棚卸しすることを検討してください(squashマージ運用のため \`git branch --no-merged\` だけでは判定できない点に注意)。"

jq -n --arg msg "$MSG" '{
  systemMessage: $msg,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $msg
  }
}'
