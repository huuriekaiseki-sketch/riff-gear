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
