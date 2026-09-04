# 共通ハーネスの検証記録（2026-09-05）

対象: riff-gear、`codex/shared-harness`。正本への統合前の専用worktreeで検証。

| 検証 | 結果 | 根拠 |
| --- | --- | --- |
| runner回帰 | 成功 | `node --test scripts/harness/harness.check.mjs`、17件 |
| 既存hook回帰 | 成功 | `scripts/*.test.sh` 全件。新runnerテストは同じCI入口へ接続 |
| lint / typecheck | 成功 | `npm run lint` / `npm run typecheck` |
| 実CLIの引数仕様 | 確認済み | インストール済みCLIの `--help` と公式ドキュメントを照合 |
| Codex/Claudeアダプター | 一部確認 | 偽CLIの実プロセスとstdin/JSON/結果ファイルの結線を確認 |
| Codex実サービス | 未実施 | 自動承認レビューがCLI実機確認を拒否。非公開repo内容の外部送信先と対象ファイルへの明示承認待ち |
| Claude実サービス | 未実施 | 同じ外部送信の確認範囲として保留。拒否の迂回として別engineを起動しない |
| 独立レビュー | 修正後に重要指摘なし | 孫プロセス残存を実再現し、テスト失敗確認後に修正。二回目のレビューで確認 |
| GitHub CI | PRで確認 | ローカル成功で代替しない。最終報告の対象SHAとPR checksを参照 |

## 実機確認で承認を得る対象

既存ログインのCodex CLIはOpenAIへ、Claude Code CLIはAnthropicへ、リクエストと
リポジトリ文脈を送信する。最初の確認計画は `AGENTS.md` と `CLAUDE.md` の共通正本参照を
読み取るだけで、コード編集を要求しない。ただしCLIは既存の指示・スキル等も自動で読み込む
ため、その文脈が送信される可能性がある。対象は専用worktreeであり、本番DB操作は含めない。

## 今回の制約

- 実サービス上の認証、project hookの信頼、書き込み権限はまだ受け入れ確認していない。
- `.claude/` の設定や既存workflow、`.codex/hooks.json` は変更していない。
- 共通runnerを通らない手動セッションは排他対象外。別worktree運用は引き続き必須。
- モデル精度比較、医療在庫の全workflow移植、他リポジトリ展開は今回の実装範囲外。
- 正本環境での「実利用可能」「設定完了」は、実CLI確認と統合後の受け入れまで保留する。
