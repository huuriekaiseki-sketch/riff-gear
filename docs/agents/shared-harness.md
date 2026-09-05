# Claude Code / Codex 共通実行契約

両者の仕様・受け入れ条件はこの文書を共通正本とし、固有の設定は分離する。
既存の対話型AIDDは維持する。工程の依存関係をJSON計画として固定して実行する場合は
`scripts/harness/run.mjs` を使う。CLIは通常のターミナル、Claude Code、Codexから同じように呼べる。

## 前提と起動

- Node.js 24、Git、利用する `codex` または `claude` CLIのログインが必要。
- 実サービスで確認した版: Codex 0.153.4、Claude Code 2.1.258。Codex 0.147.0は今回のモデルに非対応だった。実行前に `codex --version` とモデル対応を確認する。検証専用PATHの制約は [検証記録](shared-harness-acceptance.md) を参照。
- 新しいAPIキー、MCPサーバー、クラウドDBは不要。各CLIの既存認証・設定を利用する。
- [開始ゲート](parallel-agent-work.md)で最新main・Issue/PR・他セッションを確認し、専用worktreeで開始する。
- 書き込みは `codex/` / `claude/` の対応ブランチが必要。最初の書き込み実行はcleanであること。
- project hookの信頼と必要コマンドの許可は対話CLIで内容を確認して設定する。
  認証・権限不足でCLIが止まった場合、runnerはblockedとする。承認バイパスを自動追加しない。

読み取り専用の接続確認（同じtask IDは一度の作業を指す）:

```bash
node scripts/harness/run.mjs docs/agents/harness-plans/readiness.json --engine codex
```

Claude側は別worktreeで計画をコピーし、`task` を `harness-readiness-claude` に変えてから
`--engine claude` で実行する。同一taskを別engineで同時または無断引継ぎ実行すると拒否する。

## 計画の形式

`task` は作業の一意ID。`maxConcurrent` は子CLIの並列数（1〜8）、`timeoutMs` は
グラフ全体の実行上限（1〜900000ms）、`maxAttempts` は初回を含む実行上限（1〜4）。
ノード数は1〜40。各ノードの `dependsOn` に先行工程のIDを書く。

```json
{
  "task": "approved-change",
  "maxConcurrent": 2,
  "timeoutMs": 900000,
  "maxAttempts": 3,
  "nodes": [
    {"id":"implement","type":"agent","mode":"workspace-write","dependsOn":[],"prompt":"承認済み仕様と担当ファイルをここに具体的に記載する"},
    {"id":"review","type":"agent","mode":"read-only","dependsOn":["implement"],"prompt":"実装結果と実ファイルを照合し、仕様違反があればfailで根拠を返す"},
    {"id":"tests","type":"check","dependsOn":["implement","review"],"command":["npm","run","ai:check"]}
  ]
}
```

上記は形式説明用。実行前に具体的な仕様・対象ファイル・必要テストへ置き換え、人間が
計画を確認する。`check.command` は信頼する実行ファイルと引数の配列であり、任意コマンドを
実行できる。読み取り安全性を自動判定するものではない。秘密値は引数・計画へ埋め込まない。
書き込み計画は `--allow-write` を付ける。これは計画内の書き込み工程への承認を意味し、
CLIのsandbox・permissions・hookを解除しない。Claude側は `dontAsk` なので既存許可が
足りなければ停止する。設定ファイルやDB変更に必要な追加許可を自動で付与しない。

## 工程・ループ・証跡

- 独立した読み取り工程を有限枠のキューで処理し、依存結果がすべてpassになった後に後続を起動。
- 書き込み・checkは同worktree内で他工程と重ねない。全checkは全書き込みの後に置く。
- 結果は `status: pass|fail|blocked` と空でない `detail`。形式不正・CLIエラー・
  タイムアウトをpassへ補完しない。実テストの終了コードはrunnerが直接取得する。
- 読み取り/check中に追跡ファイル・非ignoreファイルが変化したらblockedとする。
  ignoreされた生成物やDBの状態はこの指紋の対象外なので、対象ごとのテストで検証する。
- 失敗時に自動で同じ操作を再送しない。原因・次の仮説・不確実性を記載したファイルを
  `--retry-note-file /絶対パス/retry.md` で渡す。上限到達はblocked。
- 再試行は同じ計画・engine・worktreeで全グラフを再実行する。書き込みを含む再試行は
  先行工程も繰り返すため、残った変更を調べたうえで承認する。結果キャッシュは再利用しない。
  前回終了後に外部変更があれば書き込み再試行を拒否する。差分をレビューして変更を確定し、
  新しいtaskで始める。強制終了で終了時の指紋が無い場合も自動的に所有変更とみなさない。
- `verified_local` はその計画内の成功だけを示す。読み取り計画の成功は実装検証を意味しない。
  **PR完了・統合には対象commitの必須GitHub CIがすべてsuccessであることを別途確認する。**

証跡保存先は `git rev-parse --path-format=absolute --git-common-dir` 配下の
`aidd-harness/<engine>/<task>-<attempt>-<uuid>/`。`plan.json`、`journal.jsonl`、
工程別processログ、`result.json` を保存する。CLIの利用量が応答に含まれればprocessログに
残るが、両者共通のトークン/金額ハード上限は未実装。今回は時間・並列数・回数で制限する。
ログは機密内容を含み得るためディレクトリ0700・ファイル0600で保存し、Gitへ追加しない。

## 衝突防止と引き継ぎ

worktree単位とtask単位のロックを共通Git領域へ原子的に取得する。両engineで同じ場所を
使うため、engineが違っても二重実行を拒否する。手動起動や別cloneはこのロックに参加しない。
通常の対話セッションも別worktreeを使い、同じ担当ファイルを同時に変更しない。

共有DB、Supabase project ID、ポート、本番更新はworktreeでは隔離されない。実行前に
専用環境を用意するか、担当者間で直列化する。runnerがDB隔離を自動構築することはない。

SIGINT/SIGTERMは実行中プロセスを停止してロックを解放する。SIGKILLや電源断でロックが
残った場合は `owner.json` のPIDと実行ログを確認する。生存プロセスが無いことを人間が
確認したうえで該当ロックだけ削除し、再試行記録を付ける。古い時刻だけで自動解除しない。
他engineへの引き継ぎは差分と証跡を確認し、新しいtask・対応ブランチで開始する。

## 実装の範囲

これは共通runner基盤である。医療在庫の全役割、Loop Until Dryの自動収束ループ、
反証・Judge Panel・知識グラフの自動構築、SDK経由の会話再開は含まない。
既存のCodexネイティブ手順の再調査ループは継続利用できる。強制力が必要な工程を
計画に具体化してrunnerに載せ、必要に応じて役割を増やす。
Claude Codeと同等精度であるという評価はまだ行っていない。
