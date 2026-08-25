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

## Markdownのみの変更でCIの重いジョブをスキップする

「Actions分数は節約したいが、CIを回す頻度は減らしたくない」場合のパターン。削るのは実行回数ではなく、1回あたりの無駄。参考実装: [PR #95](https://github.com/huuriekaiseki-sketch/riff-gear/pull/95)。

1. **`changes`ジョブで変更ファイルを判定する**
   - `github.event.pull_request.base.sha` と `head.sha` の差分を取り、`.md`以外が1件でもあれば `code=true` を `$GITHUB_OUTPUT` に出す
   - `actions/checkout` には `fetch-depth: 0` が必要。浅いcloneだとbase.shaが履歴に無く差分が取れない
   - `pull_request` 以外のイベント（push・workflow_dispatch）では無条件に `code=true` にする
   - 変更ファイルが空のときも `code=true` に倒す（安全側。CIが走らないより走る方がまし）

2. **重いジョブに `needs: changes` と `if: needs.changes.outputs.code == 'true'` を付ける**
   再利用ワークフロー（`uses:` で呼ぶジョブ）にも `needs`・`if` は付けられる。

3. **スキップ対象から外すジョブを必ず検討する**
   riff-gearでは `hooks-test` を常時実行にした。`scripts/codex-aidd-port.test.sh` が `.agents/skills/feature-proposal/SKILL.md` という**.mdファイルを検証している**ため、一律スキップするとその検証まで飛んでしまう。
   判断手順: `grep -rn "\.mdx\?[\"']" scripts tests` 等で「.mdを読んで検証しているテストが無いか」を先に確認する。

4. **ブランチ保護のrequired checksを確認する**
   `gh api repos/<owner>/<repo>/branches/main/protection` が404なら未設定でこの方式が使える。設定済みの場合、スキップされたチェックを待ち続けてマージできなくなるため、`changes` ジョブ自体を必須チェックにする等の別方式が要る。

効果: docsのみのPRで約4分 → 10秒台（`changes` ジョブのオーバーヘッドは実測4秒）。
