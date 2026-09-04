# riff-gear Claude Code instructions

## 共通ハーネス

- Codexと共通の実行・証跡契約は [shared-harness.md](docs/agents/shared-harness.md) を参照する。
- 依存グラフを固定してCLI実行する計画は `scripts/harness/run.mjs` を使う。`verified_local` をGitHub CI成功と混同しない。

## 並行作業の開始ゲート

- 編集前に `git status --short --branch`、`git fetch origin main`、`git worktree list` を実行する。
- 自分が作成していない未コミット変更がある場合、そのworktreeでは作業を始めない。変更を戻す、stageする、commitすることも禁止する。
- Claude CodeとCodexを同時に使う場合、同じ物理worktreeを共有しない。必ず別worktree・別ブランチを使う。
- Claude Codeの新規タスクは原則としてClaude Code専用worktreeで開始する。現在地を使ってよいのは、`claude/`ブランチの既存タスクを明示的に継続する場合だけとする。
- Claude Codeの新規作業ブランチは原則 `claude/<task>` とし、最新の `origin/main` から作成する。
- `codex/`ブランチは読み取り・レビューに限定し、明示的な引き継ぎなしに編集しない。
- 着手前に関連するOPEN IssueとOPEN PRを確認し、別セッションとの重複実装を避ける。
- 詳細な判定手順と禁止事項は [AIエージェント並行作業ガイド](docs/agents/parallel-agent-work.md) を正本とする。

## Codexとの設定境界

- Claude Code固有のagent・hook・一時状態は `.claude/` に置き、Codex固有の設定は `.codex/` に置く。
- 互換対応を明示された場合を除き、Claude Code作業から `.codex/` の設定や状態を変更しない。
- Codex用hookをClaude Codeへ移植するときは設定をコピーするだけで済ませず、Claude Codeの入出力契約で実行テストする。
