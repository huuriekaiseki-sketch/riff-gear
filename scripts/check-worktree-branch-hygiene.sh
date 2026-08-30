#!/usr/bin/env bash
set -uo pipefail

# SessionStart hook。worktree数・ローカルブランチ数が閾値を超えたら、
# マージ済み/クローズ済みPRに対応する claude/* ブランチとworktreeを自動削除する。
#
# WHY(2026-08-30): 当初は「棚卸しを検討してください」という警告のみだったが、
# 毎セッション手動で棚卸しするのが手間だとユーザーから指摘され、完全自動削除
# (確認なし)で運用することに合意した。安全のため対象は以下に限定する:
#   - claude/* ブランチのみ(Codexや手動ブランチには触らない)
#   - 現在チェックアウト中のブランチ・worktreeは除外
#   - worktreeに未コミット変更がある場合はそのブランチごと削除をスキップ
#   - gh pr list で state が MERGED または CLOSED と確認できたブランチのみ削除
#     (PRが見つからない/OPENのブランチは自動削除の確信が持てないため対象外とし、
#      レポートで手動確認を促す)
#   - リモートブランチ(origin/*)は削除しない(共有リポジトリへの操作は別途確認)
command -v jq >/dev/null 2>&1 || exit 0
command -v gh >/dev/null 2>&1 || exit 0

cd "$(dirname "$0")/.." || exit 0

WORKTREE_THRESHOLD=10
BRANCH_THRESHOLD=15

WORKTREE_COUNT="$(git worktree list 2>/dev/null | wc -l | tr -d ' ')"
BRANCH_COUNT="$(git branch 2>/dev/null | wc -l | tr -d ' ')"

if [ "$WORKTREE_COUNT" -le "$WORKTREE_THRESHOLD" ] && [ "$BRANCH_COUNT" -le "$BRANCH_THRESHOLD" ]; then
  exit 0
fi

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"

DELETED_LIST=""
SKIPPED_DIRTY=""
SKIPPED_NO_PR=""
SKIPPED_OPEN=""

# worktreeパス -> ブランチ名 の対応表(現在のworktreeを除く)
WORKTREE_LINES="$(git worktree list --porcelain 2>/dev/null || true)"

get_worktree_path_for_branch() {
  local branch="$1"
  printf '%s\n' "$WORKTREE_LINES" | awk -v b="refs/heads/$branch" '
    /^worktree /{path=$2}
    /^branch /{if ($2==b) print path}
  '
}

for branch in $(git branch --format='%(refname:short)' 2>/dev/null | grep '^claude/' || true); do
  if [ "$branch" = "$CURRENT_BRANCH" ]; then
    continue
  fi

  WT_PATH="$(get_worktree_path_for_branch "$branch")"

  if [ -n "$WT_PATH" ]; then
    DIRTY="$(git -C "$WT_PATH" status --short 2>/dev/null || echo dirty)"
    if [ -n "$DIRTY" ]; then
      SKIPPED_DIRTY="${SKIPPED_DIRTY}${branch}, "
      continue
    fi
  fi

  PR_INFO="$(gh pr list --head "$branch" --state all --json state,number --limit 1 2>/dev/null || echo '[]')"
  PR_STATE="$(printf '%s' "$PR_INFO" | jq -r '.[0].state // empty' 2>/dev/null || true)"

  case "$PR_STATE" in
    MERGED|CLOSED)
      if [ -n "$WT_PATH" ]; then
        git worktree remove "$WT_PATH" >/dev/null 2>&1
      fi
      if git branch -D "$branch" >/dev/null 2>&1; then
        DELETED_LIST="${DELETED_LIST}${branch}, "
      fi
      ;;
    OPEN)
      SKIPPED_OPEN="${SKIPPED_OPEN}${branch}, "
      ;;
    *)
      SKIPPED_NO_PR="${SKIPPED_NO_PR}${branch}, "
      ;;
  esac
done

if [ -z "$DELETED_LIST" ] && [ -z "$SKIPPED_DIRTY" ] && [ -z "$SKIPPED_NO_PR" ] && [ -z "$SKIPPED_OPEN" ]; then
  exit 0
fi

MSG="worktree/branch自動棚卸しを実行しました。"
if [ -n "$DELETED_LIST" ]; then
  MSG="${MSG}
削除済み(マージ/クローズ済みPR対応): ${DELETED_LIST%, }"
fi
if [ -n "$SKIPPED_DIRTY" ]; then
  MSG="${MSG}
未コミット変更ありのためスキップ: ${SKIPPED_DIRTY%, }"
fi
if [ -n "$SKIPPED_OPEN" ]; then
  MSG="${MSG}
PRがOPENのためスキップ: ${SKIPPED_OPEN%, }"
fi
if [ -n "$SKIPPED_NO_PR" ]; then
  MSG="${MSG}
対応PRが見つからないため手動確認推奨: ${SKIPPED_NO_PR%, }"
fi

jq -n --arg msg "$MSG" '{
  systemMessage: $msg,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $msg
  }
}'
