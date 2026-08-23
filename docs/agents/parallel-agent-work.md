# AIエージェント並行作業ガイド

Claude CodeとCodexを同じGitHubリポジトリで安全に使うための運用ルール。両者が同じリポジトリを扱うこと自体は許可するが、**同じ物理worktreeを同時に編集することは禁止する**。

AIエージェントの新規タスクは、同時作業の有無が不明な場合も担当agent専用worktreeから始める。既存worktreeを継続利用できるのは、人間からそのブランチの継続を明示され、かつ別agentが利用していないと確認できる場合だけとする。

## なぜworktreeを分けるか

`.claude/`と`.codex/`は別々の設定領域なので、通常は一方の起動だけで両方のhookが発火することはない。一方、同じworktreeを共有すると、以下は分離されない。

- 未コミットのファイル変更
- Gitのindexとstage状態
- migration番号や生成物
- 開発サーバー、テスト用DB、ローカルポート
- リポジトリ内に保存するhookの一時状態

hookはこれらをロックしない。同じworktreeでの同時編集は、フック設定が正しくても競合する。

## 着手前の必須確認

編集やファイル生成より前に、次を実行する。

```bash
git status --short --branch
git fetch origin main
git worktree list
gh issue list --state open --search "<task keyword>"
gh pr list --state open --search "<task keyword>"
```

次のいずれかに該当したら、そのworktreeでの作業を停止する。

- 自分が作成していない未コミット変更がある
- 別のClaude CodeまたはCodexセッションが同じworktreeを使用中である
- 同じIssueや目的に対応するOPEN PRがすでにある
- 現在のブランチが別タスクの変更を含んでいる、またはすでにマージ済みである
- Codexが`claude/`ブランチ、またはClaude Codeが`codex/`ブランチを編集しようとしており、明示的な引き継ぎがない

停止時は既存変更を戻したり、まとめてstageしたりしない。既存作業を継続するのか、新しいworktreeへ分離するのかを人間へ確認する。

## 新しい作業の分離方法

新規作業は最新の`origin/main`を起点にする。worktreeの作成先は既存worktreeの外側に置く。

```bash
# Codex
git worktree add ../riff-gear-codex-<task> -b codex/<task> origin/main

# Claude Code
git worktree add ../riff-gear-claude-<task> -b claude/<task> origin/main
```

同一Issueを引き継ぐ場合は、新しい並行実装を始めず、既存ブランチ・PR・担当セッションを確認してから継続方法を決める。

相手側agentのブランチを調査・レビューするだけなら読み取り専用で扱う。修正が必要な場合は、人間から引き継ぎを受けるか、自分用のworktree・ブランチへ変更を分離する。

## hookと状態ファイルの境界

| 対象 | Claude Code | Codex |
| --- | --- | --- |
| 設定 | `.claude/settings.json` | `.codex/hooks.json` |
| agent定義 | `.claude/agents/` | `.codex/agents/` |
| 一時状態 | `.claude/`配下 | `.codex/`配下 |
| ブランチ接頭辞 | `claude/` | `codex/` |

- 危険判定のロジックは共有してよいが、hookの入力・出力形式が両環境で同じとは仮定しない。
- 片方の設定をもう片方へコピーする場合は、実際のhook入力を与えてblock・allow・warningの挙動をテストする。
- Codexの`PreToolUse`では、未対応の確認応答へ依存せず、危険操作は`deny`して人間の手動実行へ戻す。
- Codexの品質チェック記録は`.codex/.ai-check-suggest-state/`、Claude Codeは`.claude/.ai-check-suggest-state/`を使用し、状態を共有しない。
- Codexのproject hookは、内容が変わると再確認が必要になる。作業開始時に未信頼hookの警告が出た場合は、内容を確認してから有効化する。

## PR作成前の確認

```bash
git status --short --branch
git diff origin/main...HEAD --stat
git log --oneline origin/main..HEAD
```

- 対象外のコミットやファイルが含まれていたらpush・PR作成を停止する。
- `git add -A`は避け、対象ファイルを明示してstageする。
- Claude CodeとCodexの成果を1つのPRへまとめる場合も、各ブランチの差分と検証結果を確認してから意図的に統合する。
- PRがマージされるまで、別エージェントが同じIssueへ新規着手しない。
