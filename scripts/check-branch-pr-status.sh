#!/usr/bin/env bash
set -euo pipefail

# SessionStart hook。現在のブランチが既にマージ済みのPRに対応している場合、
# そのまま新しいissue・機能の作業を始めると差分が混在したり重複実装する恐れがあるため
# 警告する。block（セッション開始そのものの停止）はできない前提のためwarningのみ。
# medical-inventory-vkumaiのscripts/check-branch-pr-status.shを移植(issue #15)。

cd "$(dirname "$0")/.."

BRANCH="$(git branch --show-current 2>/dev/null || true)"

if [ -z "$BRANCH" ] || [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  exit 0
fi

MERGED_PRS="$(gh pr list --head "$BRANCH" --state merged --json number,title,url --limit 3 2>/dev/null || echo '[]')"

if [ -z "$MERGED_PRS" ]; then
  MERGED_PRS='[]'
fi

COUNT="$(printf '%s' "$MERGED_PRS" | jq 'length' 2>/dev/null || echo 0)"

if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  exit 0
fi

SUMMARY="$(printf '%s' "$MERGED_PRS" | jq -r '.[] | "- #\(.number) \(.title) (\(.url))"')"

MSG="現在のブランチ「${BRANCH}」は既に以下のPRでマージ済みです。このまま新しいissue・機能の作業を続けると、レビュー時に既マージ分の差分が混在したり、既に他の作業で解決済みの内容を重複実装する恐れがあります。着手前に \`git fetch origin main\` → \`git checkout -b <new-branch> origin/main\` で新しいブランチを作成することを検討してください。
${SUMMARY}"

jq -n --arg msg "$MSG" '{
  systemMessage: $msg,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $msg
  }
}'
