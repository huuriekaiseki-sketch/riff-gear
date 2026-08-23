# riff-gear Codex instructions

## 並行作業の開始ゲート

- 編集前に `git status --short --branch`、`git fetch origin main`、`git worktree list` を実行する。
- 自分が作成していない未コミット変更がある場合、そのworktreeでは作業を始めない。変更を戻す、stageする、commitすることも禁止する。
- Claude CodeとCodexを同時に使う場合、同じ物理worktreeを共有しない。必ず別worktree・別ブランチを使う。
- Codexの新規タスクは原則としてCodex専用worktreeで開始する。現在地を使ってよいのは、`codex/`ブランチの既存タスクを明示的に継続する場合だけとする。
- Codexの新規作業ブランチは原則 `codex/<task>` とし、最新の `origin/main` から作成する。
- `claude/`ブランチは読み取り・レビューに限定し、明示的な引き継ぎなしに編集しない。
- 着手前に関連するOPEN IssueとOPEN PRを確認し、別セッションとの重複実装を避ける。
- 詳細な判定手順と禁止事項は [AIエージェント並行作業ガイド](docs/agents/parallel-agent-work.md) を正本とする。

## Claude Codeとの設定境界

- Codex固有のagent・hook・一時状態は `.codex/` に置き、Claude Code固有の設定は `.claude/` に置く。
- 互換対応を明示された場合を除き、Codex作業から `.claude/` の設定や状態を変更しない。
- Claude Code用hookをCodexへ移植するときは設定をコピーするだけで済ませず、Codexの入出力契約で実行テストする。
- `.codex/hooks.json`を変更したら、Codexで再度hookの内容を確認・信頼し、リポジトリのhookテストを実行する。
