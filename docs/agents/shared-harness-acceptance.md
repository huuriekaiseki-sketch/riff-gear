# 共通ハーネスの検証記録（2026-09-05）

対象: riff-gear、`codex/shared-harness`。正本への統合前の専用worktreeで検証。

| 検証 | 結果 | 根拠 |
| --- | --- | --- |
| runner回帰 | 成功 | `node --test scripts/harness/harness.check.mjs`、17件 |
| 既存hook回帰 | 成功 | `scripts/*.test.sh` 全件。新runnerテストは同じCI入口へ接続 |
| lint / typecheck | 成功 | `npm run lint` / `npm run typecheck` |
| 通常build（Turbopack） | 環境制約で失敗 | `instrumentation*.ts` の処理時に補助プロセス用ポート作成が `Operation not permitted`。権限昇格後も再現 |
| 補助build（webpack） | 成功（警告あり） | `npm run build -- --webpack`。通常buildと同一条件ではないため、CI成功の代替にしない |
| 実CLIの引数仕様 | 確認済み | インストール済みCLIの `--help` と公式ドキュメントを照合 |
| Codex/Claudeアダプター | 読み取り経路は成功 | 偽CLIの結線に加え、両実CLIで指示ファイル確認→回帰17件→終了コード0を確認 |
| Codex実サービス | 成功（検証専用PATH） | CLI 0.153.4、2026-09-05 04:41:06〜04:41:28 UTC、readiness attempt 2、verified_local |
| Claude実サービス | 成功（分離worktree） | CLI 2.1.258、2026-09-05 04:39:15〜04:39:30 UTC、readiness-claude attempt 1、verified_local |
| 独立レビュー | 修正後に重要指摘なし | 孫プロセス残存を実再現し、テスト失敗確認後に修正。二回目のレビューで確認 |
| GitHub CI | PRで追跡 | [PR #138](https://github.com/huuriekaiseki-sketch/riff-gear/pull/138) の最新head SHAに対するChecksを正本とする。途中の成功を最終成功と扱わない |

## 実機確認の承認と送信範囲

ユーザーがこの送信範囲とGitHub pushを明示承認した後に実行した。
既存ログインのCodex CLIはOpenAIへ、Claude Code CLIはAnthropicへ、リクエストと
リポジトリ文脈を送信する。最初の確認計画は `AGENTS.md` と `CLAUDE.md` の共通正本参照を
読み取るだけで、コード編集を要求しない。ただしCLIは既存の指示・スキル等も自動で読み込む
ため、その文脈が送信される可能性がある。対象は専用worktreeであり、本番DB操作は含めない。

## 今回の制約

- 読み取り経路の実サービス認証は確認済み。書き込み権限・project hookのdeny実機試験は今回の接続確認に含まない。
- 通常PATHのCodex 0.147.0はgpt-6-astraに対し「新しいCodexが必要」とHTTP 400を返した。公式0.153.4を `/private/tmp/riff-gear-codex-cli-01534` に導入し、PATH先頭へ指定して再試行した。常用CLIとグローバル設定は変更していないため、常用環境で使う前にモデル対応版へ更新が必要。
- 初回は停止中のlocalhost MCPへの警告もあった。モデル非対応が今回の終了原因であり、MCPの別サービスを勝手に起動・変更していない。
- `.claude/` の設定や既存workflow、`.codex/hooks.json` は変更していない。
- 共通runnerを通らない手動セッションは排他対象外。別worktree運用は引き続き必須。
- モデル精度比較、医療在庫の全workflow移植、他リポジトリ展開は今回の実装範囲外。
- 正本環境での「実利用可能」「設定完了」は、常用CLI更新と統合後の受け入れまで保留する。

## ローカル証跡ID

共通Git領域の `aidd-harness/` 配下（機密を含み得る生ログはGitへ登録しない）:

- Codex: `codex/harness-readiness-2-8c949331-8377-406f-b207-842e6de74358`
- Claude: `claude/harness-readiness-claude-1-7506fb71-657e-44bc-a983-292415387ea3`
- 両者の読み取り前後のfingerprintは `2853c7683e2b9554fce3b2b74bd93f73d06b46fd741f71ffb8865a65270cf93d` で一致。対象はcommit `0f53374`。以後の変更はこの検証記録・運用文書のみ。
