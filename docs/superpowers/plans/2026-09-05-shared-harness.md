# 共通ハーネス実装計画

**目的:** 両CLIで同じ計画を実行し、順序・排他・失敗停止・証跡を機械管理する。
**設計:** [設計書](../specs/2026-09-05-shared-harness-design.md)。Node.js標準ライブラリだけを使用。

## 1. 実行制御と否定テスト

- [x] `scripts/harness/harness.check.mjs` に一時Git/実プロセスを使うテストを書く。
- [x] `node --test scripts/harness/harness.check.mjs` で未実装の失敗を確認する。
- [x] `graph.mjs` に計画検証と並列実行、`process.mjs` にタイムアウトと終了コード収集を実装。
- [x] `run.mjs` にworktree/branch確認・ロック・run記録・再試行・アダプターを結線。
- [x] 同じテストを再実行。失敗時に後続の実行マーカーが無いことを検証する。

## 2. 既存経路との結線

- [x] `docs/agents/shared-harness.md` と実行可能な読み取り計画を追加。
- [x] `AGENTS.md` / `CLAUDE.md` から共通正本を参照する。
- [x] Codex feature-proposal の4体同時起動を有限枠のキュー実行へ修正。
- [x] `scripts/shared-harness.test.sh` から回帰を呼び、既存CIに載せる。
- [x] hook設定は変更せず既存回帰を実行し、互換性を確認する。

## 3. 検証・提出

- [x] 両CLIで同一の読み取り専用計画を実行し、実機結果と制約を記録。
- [ ] lint/typecheck/buildとGit差分を確認する。
- [ ] 専用ブランチをPR化し、対象commitの必須GitHub CIを確認する。
- [ ] 統合はユーザーの承認待ちとし、ローカル成功とCI成功を分けて報告する。

### 現在の到達点

実装・runner回帰17件・既存hook回帰・lint・型検査まで確認した。
通常buildは環境のポート作成禁止で失敗。補助のwebpack buildは成功した。
CLI実機確認とGitHub pushは自動承認レビューに拒否されたため、明示承認待ち。
CI未検証・PR未作成・未統合。詳細は `docs/agents/shared-harness-acceptance.md`。
