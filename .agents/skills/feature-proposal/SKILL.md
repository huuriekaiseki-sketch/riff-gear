---
name: feature-proposal
description: 開発者に「このプロダクトにこの機能は必要か？」を提案・確認し、「必要」となったら6役割ワークフロー(Sweeper→Finder→Proposer→Implementer→Critic→Closer)で確実に組み込むskill。「何かやりましょう」「次何やる？」「イシュー見て提案して」のような次のタスクを探す場面、または機能の追加・削除の要否を判断したい場面で必ず使う。
---

# 機能提案と組み込み

このskillは2段階で動く。**提案ゲート**（開発者にこの機能いる？と聞く）と、**6役割ワークフロー**（「いる」となった機能を確実に組み込む）。単発のサブエージェントに「組み込んで」と丸投げしない。

## 第1段階: 提案ゲート

1. 候補を集める。情報源は次の3つ:
   - `gh issue list --state open` のOPENイシュー
   - 直近のセッション・会話の流れ（例: 直前に作った機能の自然な拡張）
   - 自分の発案（既存機能の組み合わせ・EC定番機能でまだ無いもの）
2. 候補を2〜4個に絞り、**「このプロダクトにこの機能は必要ですか？」と開発者に確認し、回答を待つ**。選択式のユーザー入力が利用できる場合は使い、利用できない場合は通常の質問でよい。各選択肢には「何ができるようになるか」と「規模感」を1行で添える。
3. 開発者の回答で分岐する:
   - **必要** → 第2段階へ。対応するイシューが無ければ起票してから進む
   - **いらない** → 実装しない。対応イシューがあれば、理由をコメントしてクローズするか提案する
   - **やっぱり外して**（既存機能の削除依頼）→ 削除も第2段階の6役割で行う（SweeperとFinderで影響範囲を洗ってから消す）

## 第2段階: 6役割ワークフロー

親エージェントが各Roleを結線するチェックリスト付きフェーズ。省略禁止。核は「**実装前に調査を強制する**」「**実装後に片付けを強制する**」の2点。

### Role 1: Sweeper（既存コード調査）

親エージェントがCodexネイティブPhase 1をオーケストレーションし、対象機能に関連する既存実装を4軸で一度だけ洗い出す。単一agentによる検索へ置き換えたり、後続Phase 2で同じSweepを再実行したりしない。

#### 1-A. Route判定

入力は`taskDescription`と、`git diff --name-only`または変更予定から得た`changedFiles`。判定順序は固定する。

1. `changedFiles`が1件以上あり、全件がAIDDメタ改修（`.agents/skills/feature-proposal/`、`.codex/agents/`、`docs/agents/`、`scripts/codex-aidd-`）なら最優先で`aidd-phase1-meta`を返す。4 Sweepは起動せず、メタ変更の要約をfindingsとしてRole 2以降へ渡す
2. メタ改修でなく`changedFiles`が1件以上なら、パスだけで高リスク判定する。`supabase/migrations/`、`lib/supabase/`、`middleware.ts`、またはパス中の`auth`・`rls`・`policy`・`grant`は高リスク。高リスクでもPhase 1は実行するが、結果に`risk: high`と人間の慎重な確認が必要な旨を残す
3. `changedFiles`が空の場合だけ、`taskDescription`の`migration`・`マイグレーション`・`schema`・`スキーマ`・`supabase`・`middleware`・`auth`・`認証`・`login`・`ログイン`・`rls`・`policy`・`ポリシー`・`grant`・`権限`を補助判定に使う。一致したら自動Sweepせず`needs-confirmation`を返し、実際に高リスク領域へ触れるか開発者へ確認して回答を待つ
4. いずれにも該当しなければ通常のPhase 1へ進む

ファイルが分かる場合は説明文のキーワードでリスクを上書きしない。否定文の単純一致による誤routeを避けるためである。

#### 1-B. 4 Sweepの並列起動とjoin

最大ラウンド数は**3**。親エージェントは各ラウンドで次の4 agentをすべて起動してからjoinし、4体すべての結果が揃うまでCompleteness Criticや次フェーズを起動しない。

- `sweep-ui`
- `sweep-data`
- `sweep-db`
- `sweep-types`

初回は各agentへ`taskDescription`と担当軸を渡す。2巡目以降は、それまでの4軸findingsとCompleteness Criticの`追加調査対象`も渡し、未調査箇所だけを追加調査させる。各Sweepの結果契約は`status: pass|blocked`と空でない`detail`。`pass`は調査完了を意味し、指摘なしは`detail: 指摘なし`で表す。

#### 1-C. 結果検証とfail-closed

join後、4結果を個別に検証する。結果なし、`status`が`pass|blocked`以外、`detail`欠落・空文字、または1体でも`blocked`なら、その時点で`blocked`を返す。欠けた結果を`指摘なし`で補完せず、Completeness CriticとPhase 2は起動しない。

全体が`pass`なら、`ui`・`data`・`db`・`types`別にfindingsへ追記する。後続ラウンドの結果で前ラウンドを上書きしない。

#### 1-D. Completeness CriticとLoop Until Dry

4 Sweepがすべて有効な`pass`だった場合だけ、累積findingsを`completeness-critic`へ渡す。応答は次の2択だけを有効とする。

- 完全一致の`新規指摘なし`: dry streakを1増やす
- `追加調査対象:`で始まり、1件以上の箇条書きがある: dry streakを0へ戻し、内容を次ラウンドの4 Sweepへ渡す

応答なし・それ以外の形式は`blocked`。**2ラウンド連続**で`新規指摘なし`なら`pass`。3巡を終えてdry streakが2未満なら、調査未収束として`blocked`を返す。Critic自身に終了宣言やラウンド管理を委ねず、親エージェントが連続回数を数える。

#### 1-E. Phase 1出力と一度だけの受け渡し

出力は次の4状態に正規化する。

- `aidd-phase1-meta`: Sweepを省略した理由とメタfindings
- `needs-confirmation`: 確認理由、キーワード一致、開発者回答待ち
- `pass`: `risk`、実行ラウンド数、dry streak、ラウンド履歴を保持した4軸`findings`
- `blocked`: 失敗stage・agent・理由・取得済みfindings。実装開始不可

`pass`または`aidd-phase1-meta`のfindingsはRole 2とRole 3へ渡し、承認後はRole 4のPhase 2入力へ同じオブジェクトを渡す。Role 1の旧来の`grep`調査は追加実行せず、Role 4もPhase 1 Sweepを再起動しない。`blocked`と`needs-confirmation`ではRole 4へ進まない。4軸findingsから「実は既に実装済み」を必ず疑い、該当時はRole 3で実装せず終了する選択肢を提示する。

### Role 2: Finder（関連イシュー・過去事例）

1. 機能キーワードを2〜3個抽出し、`gh issue list --search` と `gh pr list --search` で**CLOSED/MERGEDも含めて**検索する
2. 重複対応・既にクローズ済み・過去に見送られた経緯がないか確認する

出力: 「#番号 状態 タイトル — 関連度メモ」の箇条書き

### Role 3: Proposer（設計確認）

Sweeper・Finderの結果を踏まえ、実装方針を開発者に確認し、回答を待つ。

- 実装アプローチが複数あるなら選択肢として提示する（推奨に「(推奨)」を付ける）
- 閾値・文言・置き場所など、開発者の好みが出る設定値を確認する
- Sweeper/Finderで「既に実装済み」と判明した場合は、実装せず報告して終了する選択肢を必ず提示する
- **影響する層を複数選択で確認する**: 「この機能はどの層に影響しますか？」→ UI（`app/`ページ・コンポーネント）／データ（`lib/`・Server Actions・Route Handlers）／DB（`supabase/migrations/`）。複数選択UIが無ければ、該当する層を列挙してもらう。この回答がRole 4の実装方式を決める

### Role 4: Implementer（実装・検証）

**影響層が2つ以上ならCodexネイティブのPhase2を使う**: Role 3で選ばれた層が2つ以上の場合、以下を親エージェントがオーケストレーションする。各段階で全subagentの完了を待ち、結果を検証してから次へ進む。入力には承認済み方針とRole 1の4軸findingsを含め、Phase 1 Sweepは再実行しない。

1. 選ばれた層に対応する`implementer-ui`・`implementer-data`・`implementer-db`を並列起動する。各依頼にタスク、承認済み方針、担当層、他agentと同じファイルシステムを共有していることを含める。結果は`status: pass|blocked`、`detail`、`changedFiles`で受け取る
2. 結果が無い、形式が不正、または1体でも`blocked`なら後続を起動せず、`aidd-phase2-blocked(stage=implement)`としてRole 5へ引き継ぎ、開発者へ報告する
3. 全実装結果と変更ファイル一覧を`integrator`へ渡して起動し、結線と`build/typecheck/lint/test`を確認させる。結果が無い、形式が不正、または`blocked`なら`aidd-phase2-blocked(stage=integrate)`として停止する
4. `reviewer`を「正しさ」「仕様網羅」「重複・過剰実装」「型安全」の4観点で並列起動し、それぞれ1観点だけを検証させる
5. 4体すべてが`pass`なら`aidd-phase2-pass`とする。`fail`または結果不正があれば指摘を全実装担当へ返し、実装→統合→4観点レビューをやり直す。差し戻しは最大3回とし、解消しなければ`aidd-phase2-blocked(stage=review)`として停止する

影響層が1つだけなら以下の手動フローでよい（並列オーケストレーションのオーバーヘッドに見合わないため）。

**手動実装フロー（影響層1つの場合、またはPhase2が使えない場合）:**
1. 既存コードのパターン・命名・設計を踏襲して実装する
2. `npm run build` と `npm test` を通す
3. ブラウザプレビューで実際に動作確認する。riff-gearでの定石:
   - 利用可能なブラウザ操作・E2E手段で確認する。devサーバーが必要なら`npm run dev`を継続ターミナルセッションで起動し、確認後に必ず停止する
   - ログインが要る場合はMailpit(`http://127.0.0.1:54524`)からマジックリンクを取得する
   - テストデータが要る場合はSupabase REST API(`curl -X PATCH .../rest/v1/products?...`)で一時的に調整する
   - 通知系など画面に出ないロジックは`console.log`の一時デバッグ出力で確認する

**Phase2ワークフローを使った場合も**、Role 5のCriticチェックリストは省略しない（integratorのbuild/test確認を鵜呑みにせず、最終的な`git diff`確認は必ず人間相当の目で行う）。

### Role 5: Critic（検証・批判）

Implementerの「動いた」を疑う。チェックリスト:

- [ ] 一時デバッグ出力(`console.log`等)を削除したか（`git diff`で確認）
- [ ] テストデータ（在庫数・テスト注文・テストユーザー）を元に戻したか
- [ ] プレビューサーバーを停止したか
- [ ] `git diff`の内容が意図した変更だけか（無関係ファイルの混入がないか）
- [ ] 削除・復元後にもう一度 `npm test` が通るか

### Role 6: Closer（完了処理）

1. 変更ファイルを個別に `git add`（`git add -A` は使わない）してコミット。イシューがあればコミットメッセージまたはPR本文に `closes #N` を入れる
2. push → `gh pr create`（Test planに実際にやった検証を書く）
3. `gh pr checks --watch` でCI全通過を確認する
4. **マージは開発者に確認してから** `gh pr merge`
5. マージ後: リモートブランチ削除、イシューのクローズ確認、メモリ(`MEMORY.md`)に残すべき決定があれば更新
