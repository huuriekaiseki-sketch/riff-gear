# 実装パターン集

riff-gearで一度確立した「毎回同じ形で実装できる」パターン。新しい機能を作る前に該当パターンが無いか確認する。known-failure-patterns.mdが「踏んだ落とし穴」を記録するのに対し、こちらは「もう一度やる時に迷わないための型」を記録する。

## Vercel Cronで定期実行タスクを追加する

時間トリガー（「毎日決まった時刻に自動実行したい」）が必要になったら、このパターンで実装する。参考実装: [放棄カート通知のCron化](https://github.com/huuriekaiseki-sketch/riff-gear/pull/64)。

1. **既存のイベント駆動ロジックがあれば、共通関数として`lib/`に抽出する**
   通知処理などが既にUI側から呼ばれている場合、ロジック自体は変えずに`SupabaseClient`を引数で受け取る形の関数として`lib/`配下に切り出す。呼び出し元（既存のイベント駆動 / 新設するCron）両方から同じ関数を呼べるようにする。
   例: `lib/cartAbandonment.ts`の`checkAndNotifyAbandonedCarts(supabase: SupabaseClient)`

2. **`app/api/cron/<task-name>/route.ts`にGETハンドラを新設する**
   - Cronにはユーザーセッションが無いため、`lib/supabase/admin.ts`の`createAdminClient()`（service role、RLSバイパス）を使う
   - `request.headers.get('authorization')`が`Bearer ${process.env.CRON_SECRET}`と一致するか検証し、不一致なら401を返す（第三者がURLを直接叩けないようにする）

3. **`vercel.json`にスケジュールを追加する**
   ```json
   {
     "crons": [
       { "path": "/api/cron/<task-name>", "schedule": "0 0 * * *" }
     ]
   }
   ```
   スケジュールはUTC基準。JST 9時 = `0 0 * * *`のように、9時間の差を引いて計算する。

4. **`CRON_SECRET`をVercelのProduction環境変数に追加する**（未作成の場合のみ、プロジェクト全体で1つで足りる）
   ```
   openssl rand -hex 32
   npx vercel env add CRON_SECRET production --value "<生成した値>" --yes
   ```
   Sensitive設定・Productionのみで登録する（Previewには不要）。

5. **既存のイベント駆動トリガーは基本的に残してよい**
   通知済みフラグ（`*_notified_at is null`等）で絞り込む設計になっていれば、Cronとイベント駆動が同時期に両方発火しても二重通知にならない。無理に片方を削除する必要はない。

6. **マージ後の確認**
   Vercelダッシュボード → Deployments → Cron Jobsタブで、スケジュール通り登録・発火しているか確認する。
