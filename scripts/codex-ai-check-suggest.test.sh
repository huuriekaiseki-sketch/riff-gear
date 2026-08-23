#!/usr/bin/env bash
# WHY: CodexのStopフックがClaude Codeのtranscriptや状態ディレクトリへ依存せず、
# 安定したPostToolUse入力だけでai:check実行有無を判定できることを検証する。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOKS_FILE="$ROOT/.codex/hooks.json"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

TRACK_COMMAND="$(jq -r '
  [.hooks.PostToolUse[]?.hooks[]?
    | select(.command | contains("codex-ai-check-track.sh"))][0].command // ""
' "$HOOKS_FILE")"
[[ -n "$TRACK_COMMAND" ]] || fail "Codex用のai:check追跡hookが設定されていません"

STOP_COMMAND="$(jq -r '
  [.hooks.Stop[]?.hooks[]?
    | select(.command | contains("codex-ai-check-suggest.sh"))][0].command // ""
' "$HOOKS_FILE")"
[[ -n "$STOP_COMMAND" ]] || fail "Codex用のai:check Stop hookが設定されていません"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

REPO_DIR="$WORKDIR/repo"
mkdir -p "$REPO_DIR/scripts" "$REPO_DIR/.codex"
cp "$ROOT/scripts/codex-ai-check-track.sh" "$REPO_DIR/scripts/"
cp "$ROOT/scripts/codex-ai-check-suggest.sh" "$REPO_DIR/scripts/"
printf '%s\n' '/.codex/.ai-check-suggest-state/' > "$REPO_DIR/.gitignore"

git -C "$REPO_DIR" init -q
git -C "$REPO_DIR" config user.email test@example.com
git -C "$REPO_DIR" config user.name test
printf '%s\n' 'export const x = 1' > "$REPO_DIR/app.ts"
git -C "$REPO_DIR" add app.ts scripts .gitignore
git -C "$REPO_DIR" commit -qm init
printf '%s\n' 'export const x = 2' > "$REPO_DIR/app.ts"

run_stop() {
  local session_id="$1"
  local input
  input="$(jq -n --arg sid "$session_id" '{
    session_id: $sid,
    transcript_path: "/存在しない/Codex/transcript.jsonl"
  }')"
  (cd "$REPO_DIR" && printf '%s' "$input" | bash -c "$STOP_COMMAND")
}

SESSION_ID="codex-session-1"

BEFORE_TRACK="$(run_stop "$SESSION_ID")"
BEFORE_MESSAGE="$(printf '%s' "$BEFORE_TRACK" | jq -r '.systemMessage // ""')"
[[ "$BEFORE_MESSAGE" == *"実行された痕跡が見当たりません"* ]] \
  || fail "テスト未実行なのにCodex Stop hookが警告しませんでした: $BEFORE_TRACK"

POST_INPUT="$(jq -n --arg sid "$SESSION_ID" '{
  session_id: $sid,
  tool_name: "Bash",
  tool_input: {command: "npm test"}
}')"
(cd "$REPO_DIR" && printf '%s' "$POST_INPUT" | bash -c "$TRACK_COMMAND")

AFTER_TRACK="$(run_stop "$SESSION_ID")"
AFTER_MESSAGE="$(printf '%s' "$AFTER_TRACK" | jq -r '.systemMessage // ""')"
[[ -z "$AFTER_MESSAGE" ]] \
  || fail "テスト実行後もCodex Stop hookが警告しました: $AFTER_TRACK"

[[ -f "$REPO_DIR/.codex/.ai-check-suggest-state/$SESSION_ID.hash" ]] \
  || fail "Codexのai:check状態が.codex配下へ保存されていません"
[[ ! -e "$REPO_DIR/.claude/.ai-check-suggest-state/$SESSION_ID.hash" ]] \
  || fail "Codexのai:check状態がClaude Code側へ書き込まれました"

printf '%s\n' 'export const x = 3' > "$REPO_DIR/app.ts"
AFTER_CHANGE="$(run_stop "$SESSION_ID")"
AFTER_CHANGE_MESSAGE="$(printf '%s' "$AFTER_CHANGE" | jq -r '.systemMessage // ""')"
[[ "$AFTER_CHANGE_MESSAGE" == *"実行された痕跡が見当たりません"* ]] \
  || fail "テスト後にコードが変わったのにCodex Stop hookが警告しませんでした: $AFTER_CHANGE"

printf 'PASS: Codex ai:check hooks are isolated from Claude Code\n'
