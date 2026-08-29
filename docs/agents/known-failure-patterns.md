# 既知の失敗パターン

Sweepエージェントが機械的にチェックする、riff-gearでこれまでに実際に発生した/発生しうる不具合パターン。新しく踏んだ落とし穴が見つかったら、ここに追記する。

## DB層

- **GRANT文の欠落**: RLSポリシー（`create policy ...`）だけを書いてテーブル本体への`grant select/insert/update/delete on <table> to <role>`を書き忘れると、ローカルSupabase（migrationsのみから再構築）では`permission denied for table ...`で全操作が失敗する。本番は手動で権限付与されていて気づかないことがある（[supabase/migrations/0006_grants.sql](../../supabase/migrations/0006_grants.sql)参照、実際に踏んだ）。新しいテーブル・`security definer`関数を追加したら、対応するGRANTが漏れていないか確認する
- **`anon`ロールへの無条件書き込み許可**: `WITH CHECK (true)`のような無条件許可ポリシーが`anon`ロールに付与されていないか
- **`security definer`関数の権限バイパス**: `place_order()`/`cancel_order()`のような`security definer`関数は、内部で`auth.uid()`による所有者チェックを必ず行っているか（RLSをバイパスするため、関数内チェックが唯一の防御線になる）

## データ取得層（Server Actions / Route Handlers）

- 認可チェック漏れ: `app/**/actions.ts`・`app/**/route.ts`で、RLSに認可を委ねているつもりが実は当該テーブルにRLSポリシーが無い/緩い、というケース
- 入力値検証なし: `formData.get(...)`で取得した値をそのままDBクエリに渡していないか

## UI層

- `target="_blank"`のリンクに`rel="noopener"`が無い
- Server Actionの`redirect()`後にエラーメッセージがクエリパラメータ経由で表示されず、ユーザーに失敗が伝わらない

## 並行開発・運用層

複数のブランチ/セッションが同時にmainへ向けて開発している状況特有の失敗。コードの静的パターンではなく、Sweeper/Finder段階での事前チェックや運用ルールで防ぐ性質のもの。

- **マイグレーション番号の衝突**: 複数PRが同時に「mainの最新連番+1」を採番すると、片方が後からマージされた際に番号が重複し、`supabase db reset`が`duplicate key value violates unique constraint "schema_migrations_pkey"`でCI失敗する(実際に#39・#40・#44で連鎖的に発生、#46で機械検知をCIに追加して再発防止済み)。新しいマイグレーションを追加する前に、必ず`git fetch origin main`して最新の連番を確認する。CIの重複検知ステップ([.github/workflows/ci.yml](../../.github/workflows/ci.yml))が落ちたら、まずこれを疑う
- **並行セッションでの同一issueへの重複着手**: Finder段階で`gh issue list --search`はチェックしていても、「今まさに他セッションが着手中で未クローズのOPEN PR」の存在確認を怠ると、同じissueに対して独立に実装してしまい手戻りになる(実際に#22で発生、issue自体は既にクローズされ別実装がmainにマージ済みだった)。Finder段階で`gh pr list --search <キーワード>`もあわせて確認し、関連するOPEN PRが無いか見る
- **Claude CodeとCodexによる同一worktreeの共有**: `.claude/`と`.codex/`の設定が分かれていても、未コミット変更・Git index・ローカル実行環境は共有される。同時編集すると相互の変更をstageしたり、同じファイルを上書きしたりするため、必ず別worktree・別ブランチへ分離する。開始ゲートとhook境界は[AIエージェント並行作業ガイド](parallel-agent-work.md)に従う
- **Supabaseローカル環境のスキーマキャッシュ不整合**: `supabase db reset`直後にPostgRESTのスキーマキャッシュが更新されず、新しいテーブル・カラムに対して`Could not find the table/column ... in the schema cache`が返ることがある。`docker restart supabase_rest_<project>`で解消するか、`supabase db reset`をもう一度実行する
- **squashマージ運用では`git branch --no-merged`が当てにならない**: squashマージはmainに新しいSHAの1コミットを作るため、元ブランチのコミット自体はmainに存在しない。その結果、内容が完全に取り込まれているブランチでも`git branch -r --no-merged origin/main`は「未マージ」と報告する(2026-08-26のブランチ整理で実際に誤判定し、「5本は中身を確認しないと消せない」と誤報告した。実際は4本がMERGEDされたPRのブランチで、残り1本もmainに取り込み済みの古いブランチだった)。ブランチを削除してよいかは`gh pr list --head <ブランチ名> --state all`でPRの状態を見て判断する。PRが1件も無いブランチだけ`git diff origin/main origin/<ブランチ名> --stat`で中身を確認する。なお2026-08-26にリポジトリ設定`delete_branch_on_merge`を有効化したため、以降マージされたPRのブランチは自動削除され、この判定自体が不要になる

## エージェント実行環境層

Claude Codeエージェント自身のツール実行・ファイル書き込みに起因する不具合。コードのパターンではなく、エージェントの作業手順で防ぐ性質のもの。

- **`find`/`ls`ではなく`git ls-files <path>`でファイルの既存有無を確認する**: `find`/`ls`の結果が実際のgit管理状態と食い違うことがある。既存ファイルを「新規ファイルだ」と誤認してWriteで全体書き換えすると、正本ドキュメント(例: `docs/agents/quality-loop.md`)を丸ごと消しかねない。既存ファイルへの変更はWriteでなくEditツールを使う(Editは事前のReadを要求するため、未確認ファイルの上書きを構造的に防げる)
- **vitest非対象のスクリプトに`.test.mjs`/`.test.ts`と命名しない**: [vitest.config.ts](../../vitest.config.ts)は`include`を指定していないため、vitestのデフォルトパターン(`**/*.{test,spec}.?(c|m)[jt]s?(x)`)がリポジトリ全体の`*.test.mjs`等を拾う。素のnodeスクリプト(hooks-test用ハーネス等)をこの命名で置くと、スクリプト自体は正常でも`No test suite found`でtestジョブがfailする(2026-08-29、PR #118の`scripts/aidd-phase2-workflow.test.mjs`で実際に発生し`.check.mjs`へ改名して解消)。hooks-test CIが拾う`scripts/*.test.sh`(シェル)は対象外なので問題ない

### レビュー・引き継ぎ情報を鵜呑みにした誤診断(2026-08-29、実例あり)

Codexレビューや前セッションの引き継ぎメモが「未実装」「消えた」と主張していても、それ自体が誤りのことがある。**着手前・異常を感じた時点で、以下の順に実ファイル・git履歴で裏取りする**（[verify-claims](../../.claude/skills)スキルの適用対象）:

1. 対象ファイルに`grep`をかけ、指摘された不備が実際に存在するか確認する
2. `git log -- <対象ファイル>`で過去に同じ内容の実装コミットが無いか確認する
3. 差分が無いように見えたら、まず`git diff HEAD -- <file>`で「本当に変更していない(＝既存実装と同じだった)」を最有力候補として疑う。「ツールが壊れて書き込みが消えた」という結論は、1〜3を全て潰してから初めて検討する

**実例**: 2026-08-29のセッションで、Codexレビューが「アプリ側が冪等キーを渡していない」と指摘したのを裏取りせずP0-1として実装に着手。実際には`app/cart/CheckoutForm.tsx`/`app/cart/checkout/route.ts`は8/26のPR #102で既に配線済みだった。`git status`で差分ゼロだったことを「Write/Editツールがディスクに反映しない不具合」と誤診断し、その誤情報を本ファイルに記録してしまった(このセクションが該当箇所を訂正したもの)。あわせて既存の`tests/idempotency/place-order-idempotency.test.ts`と内容が重複する新規テストファイルも作成してしまった。教訓: **異常に見える現象ほど、まず「自分の前提が古い/誤っている」を疑う**

### AskUserQuestionへの回答を「仕様確認完了」と誤認して実装に直行(2026-08-29、実例あり)

`feature-proposal`スキルRole 3(Proposer)は「実装アプローチ・閾値・影響層」等をAskUserQuestionで確認する設計だが、この**質問への回答**と、**仕様書を作って実装可否そのものの承認を得ること**は別の工程である。前者は仕様の材料集めに過ぎない。

**実例**: 「未発送のまま3日以上経過した注文を強調表示」機能で、判定条件・見た目の2問にAskUserQuestionで回答をもらった直後、それを仕様確定とみなして「実装に進みます」の一言も無くEdit/Writeを開始した。結果として、開発者が別途合意していた「UI変更時はClaude Designでモックを作り、見てから進める」フロー(このセッションで`.claude/skills/feature-proposal/SKILL.md`のRole 3に明文化・追記した)を素通りした。開発者から「なんで仕様書をすっ飛ばしたのか」と指摘されるまで気づかなかった。

教訓: **質問に答えてもらった瞬間に「もう進めていい」と判断しない**。Role 3では「内容確認(AskUserQuestion)」と「仕様書提示+実装可否の独立した承認」を別ステップとして扱い、後者の明示的な承認を得るまでEdit/Writeを開始しない。開発者の回答が「特にない」「お任せ」のように選好不明な場合、モック作成やテスト計画の記載を省略する方向へ倒さない(省略しない側を選ぶ)。

### PR本文(Issueコメント)にリポジトリ相対パスで画像を貼っても表示されない(2026-08-29、実例あり)

`![alt](docs/pr-assets/.../foo.png)`のようにリポジトリルートからの相対パスでPR本文に画像を書いても、GitHub上でレンダリングされない(壊れたリンクアイコン+テキストのみ表示)。README.mdやリポジトリ内の他のMarkdownファイルではこの相対パスが機能するが、PR本文・Issueコメントは特定のファイルパスに対する相対パスの解決コンテキストを持たないため、これらは別物として扱う必要がある。

**実例**: PR #125で`docs/pr-assets/highlight-unshipped-orders/annotated_orders.png`をコミットし、PR本文に相対パスで埋め込んだが、GitHub上で画像が表示されなかった。`https://raw.githubusercontent.com/<owner>/<repo>/<commit-sha>/<path>`という絶対URL(pushしたコミットのSHAを使う)に書き換えたところ正しく表示された。

教訓: **PR本文に画像を埋め込む際は、必ず`raw.githubusercontent.com`形式の絶対URLを使う**。画像をコミットした後、そのコミットのSHA(`git rev-parse HEAD`)を使ってURLを組み立てる。`gh pr create`直後は必ずブラウザで実際にレンダリングされているか目視確認し、リンクのままなら`gh pr edit --body-file`で修正する。

### UI差分のあるPRにafter画像しか貼らず、before画像を省略した(2026-08-29、実例あり)

PR #125(未発送のまま3日超過した注文の強調表示)で、変更後(強調表示された状態)のスクショだけをPR本文に貼り、変更前(強調表示が無い通常の注文一覧)のスクショを貼らなかった。after画像1枚だけでは、初見のレビュアーが「これが変更後の状態」としか分からず、何がどう変わったのかが画像だけでは伝わらない。1枚の画像内に対象行と非対象行が両方映っていて対比できるように見えても、それは「afterの中の部分的な対比」であって「before全体との対比」ではないため、独立したbefore画像の代わりにはならない。

**背景**: この失敗は、ユーザーから3回連続で類似の指摘を受けて初めて気づいた(1回目: 仕様確認をAskUserQuestionの回答で済ませて実装に直行、2回目: それをknown-failure-patterns.mdに書かず個人メモリにだけ書いた、3回目: 本件でbefore画像の欠落を指摘されてもなお、最初は個人メモリにしか書かずdocs/agents/known-failure-patterns.mdへの追記を怠った)。「指摘されたら直す」だけでは同じ会話内で何度も同じ種類のミスが起きる。

教訓: **UI差分のあるPRは、before(変更前)とafter(変更後)の両方のスクショを必ず貼る**(`pr-screenshot`スキルの「UI差分があるPRはbefore/after両方が必須」を参照)。加えて、**ユーザーから指摘を受けたら、対応が終わった直後に「これは`docs/agents/known-failure-patterns.md`に書くべきミスか」を必ず自問する**(個人メモリへの記録だけで済ませない。個人メモリは自分専用でセッションを跨いで思い出すためのもの、`known-failure-patterns.md`はこのリポジトリで動く全AIエージェント共通の正本であり、両方に書く必要がある場面では両方に書く)。
