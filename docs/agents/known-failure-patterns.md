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
