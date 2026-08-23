# Codex AIDD再レビュー修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex版AIDDへPhase 1を結線し、読み取り専用ロール、Vercel削除ガード、push前実機ゲートを実効性のある状態にする。

**Architecture:** `.agents/skills/feature-proposal`をCodexネイティブの親オーケストレーター正本とし、Phase 1は4 SweepのjoinとCompleteness CriticのLoop Until Dry、Phase 2は既存の実装・統合・レビューを使う。安全境界はagentのread-only sandbox、PreToolUseのdeny、commit SHA固定の独立cloneで強制する。

**Tech Stack:** Codex custom agents TOML、Agent Skills Markdown、Bash、jq、Git、Codex CLI 0.147.0+

**Spec:** 再レビュー結果（Phase 1未結線、read-only未強制、Vercelパス回避、実機検証SHA不一致）

## Global Constraints

- Claude Code用`.claude/`とCodex用`.codex/`の状態を共有しない。
- shell testだけを実機hook検証の代替にしない。
- agent設定文言の固定テストは作らず、利用者挙動は実Codex agent evalで確認する。
- pushは行わない。

---

### Task 1: Phase 1とread-onlyロール

**Files:**
- Modify: `.agents/skills/feature-proposal/SKILL.md`
- Modify: `.codex/agents/completeness-critic.toml`
- Modify: `.codex/agents/reviewer.toml`
- Modify: `.codex/agents/sweep-ui.toml`
- Modify: `.codex/agents/sweep-data.toml`
- Modify: `.codex/agents/sweep-db.toml`
- Modify: `.codex/agents/sweep-types.toml`
- Modify: `scripts/codex-aidd-port.test.sh`

**Interfaces:**
- Consumes: `sweep-ui|sweep-data|sweep-db|sweep-types`の`status/detail`、`completeness-critic`の二択出力
- Produces: `aidd-phase1-meta|needs-confirmation|pass|blocked`とPhase 2へ渡す4軸findings

- [ ] **Step 1: read-only設定が無いと失敗する構成テストを追加する**
- [ ] **Step 2: `bash scripts/codex-aidd-port.test.sh`がread-only不足で失敗することを確認する**
- [ ] **Step 3: 6ロールへ`sandbox_mode = "read-only"`を追加する**
- [ ] **Step 4: Phase 1 router、4 Sweep join、結果検証、Critic、2回連続dry、最大3巡をskillへ追加する**
- [ ] **Step 5: 構成テストをGREENにし、実Codex CLI agent evalでPhase 1計画を確認する**

### Task 2: Vercel CLIパス回避

**Files:**
- Modify: `scripts/check-vercel-env-danger.sh`
- Create: `scripts/check-vercel-env-danger.test.sh`

**Interfaces:**
- Consumes: Codex/ClaudeのPreToolUse JSON `tool_name`と`tool_input.command`
- Produces: bare、package runner、絶対・相対パスの`vercel env rm|remove`へ`deny|ask`

- [ ] **Step 1: `/usr/local/bin/vercel`と`./node_modules/.bin/vercel`が未検知で失敗する回帰テストを書く**
- [ ] **Step 2: テストが期待した理由でREDになることを確認する**
- [ ] **Step 3: 実行ファイルのパス接頭辞を許容する最小の正規表現修正を行う**
- [ ] **Step 4: bare、npx、pnpm/yarn dlx、絶対・相対パス、連結コマンドをGREENにする**

### Task 3: commit固定の実機ゲート

**Files:**
- Modify: `docs/agents/parallel-agent-work.md`

**Interfaces:**
- Consumes: cleanなsource worktreeのHEAD SHAと`command -v codex`
- Produces: 同じSHAの独立clone、CLI version・SHA・Source・Review/Active・block理由・marker不在の記録

- [ ] **Step 1: 変更をcommit済みかつworktree cleanにする前提を明記する**
- [ ] **Step 2: branch名ではなく`source_sha`をdetach checkoutし、source/clone SHA一致を検査する**
- [ ] **Step 3: PATH変更前に`codex_bin`を解決し、固定PATHに依存せず起動する**
- [ ] **Step 4: 実Codex CLIで偽Vercelが理由付きdenyされ、markerが無いことを再確認する**

### Task 4: 統合検証とコミット

**Files:**
- Modify: 上記対象のみ

- [ ] **Step 1: 全`scripts/*.test.sh`、typecheck、lint、Vitest、buildを実行する**
- [ ] **Step 2: `git diff --check`と`git status`で対象外変更が無いことを確認する**
- [ ] **Step 3: 独立レビューを行い、Critical/Importantが無いことを確認する**
- [ ] **Step 4: 対象ファイルを明示stageし、ローカルcommitする。pushしない**
