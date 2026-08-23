#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOKS_FILE="$ROOT/.codex/hooks.json"
SKILL_FILE="$ROOT/.agents/skills/feature-proposal/SKILL.md"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

[[ -f "$HOOKS_FILE" ]] || fail ".codex/hooks.json が存在しません"
[[ -f "$SKILL_FILE" ]] || fail "feature-proposal skill が存在しません"

if rg -n 'CLAUDE_PROJECT_DIR' "$HOOKS_FILE"; then
  fail "Codex hook が Claude Code 専用の CLAUDE_PROJECT_DIR に依存しています"
fi

if rg -n '\.Codex/workflows|`Workflow`ツール|scriptPath:' "$SKILL_FILE"; then
  fail "Codex skill が存在しない Workflow ツールまたは workflow パスを参照しています"
fi

python3 - "$ROOT" <<'PY'
import glob
import os
import sys
import tomllib

root = sys.argv[1]
files = sorted(glob.glob(os.path.join(root, ".codex/agents/*.toml")))
if len(files) != 10:
    raise SystemExit(f"expected 10 Codex agents, got {len(files)}")

required = {"name", "description", "developer_instructions"}
for path in files:
    with open(path, "rb") as handle:
        data = tomllib.load(handle)
    missing = required - data.keys()
    if missing:
        raise SystemExit(f"{path}: missing {sorted(missing)}")
PY

PRE_TOOL_COMMAND="$(node -e '
  const fs = require("fs");
  const hooks = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(hooks.hooks.PreToolUse[0].hooks[0].command);
' "$HOOKS_FILE")"

SAFE_INPUT='{"tool_name":"Bash","tool_input":{"command":"npm test"}}'
SAFE_OUTPUT="$(printf '%s' "$SAFE_INPUT" | env -u CLAUDE_PROJECT_DIR bash -c "$PRE_TOOL_COMMAND")"
[[ -z "$SAFE_OUTPUT" ]] || fail "安全なコマンドがhookに拒否されました: $SAFE_OUTPUT"

DENY_INPUT='{"tool_name":"Bash","tool_input":{"command":"psql -c \"drop table users\""}}'
DENY_OUTPUT="$(printf '%s' "$DENY_INPUT" | env -u CLAUDE_PROJECT_DIR bash -c "$PRE_TOOL_COMMAND")"
DENY_DECISION="$(printf '%s' "$DENY_OUTPUT" | jq -r '.hookSpecificOutput.permissionDecision // ""')"
[[ "$DENY_DECISION" == "deny" ]] || fail "危険なDDLをhookが拒否しませんでした: $DENY_OUTPUT"

printf 'PASS: Codex AIDD port smoke test\n'
