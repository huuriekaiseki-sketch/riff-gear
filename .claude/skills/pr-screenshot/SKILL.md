---
name: pr-screenshot
description: riff-gearのUI変更を、枠線・ラベル付きのスクリーンショットとしてPR用に撮影する。撮影(puppeteer-core、ログイン込みで1回だけ)と注釈合成(sharp、ブラウザ不使用で何度でも編集可能)を分離しているため、見た目調整のたびにブラウザ再起動・DBリセット・ログインをやり直す必要がない。Use when UI変更を含むPRでスクリーンショットが必要なとき、「スクショ撮って」「PRに画像入れて」「見た目を確認したい」と言われたとき。
---

# PR用スクリーンショット撮影

## UI差分があるPRはbefore/after両方が必須(省略禁止)

見た目に差分が出るUI変更を含むPRでは、**変更後(after)のスクショだけでは不十分**。変更前(before)のスクショも必ず添えて、PR単体で「何がどう変わったか」を画像だけで判断できるようにする。after1枚だけでは、初見の人が「これが変更後の状態」としか分からず、差分そのものが伝わらない。

- before: 変更前の状態を`capture-template.js`で撮る(既存ページなら必ず撮る。新規ページの場合はbefore自体が存在しないため省略可)
- after: 変更後の状態を`capture-template.js`(実装後)または`capture-mock-template.js`(実装前の静的モック)・`mock-capture.js`(実装前のインタラクティブモック、状態ごと)で撮る
- 1枚の画像内で対比できるなら(例: 同じ一覧に強調対象の行と非対象の行が両方映っている)、それをafter画像として使いつつ、それでも独立したbefore画像は別途用意する。「同じ画像の中で対比できているからbefore不要」と判断しない
- PR本文では画像の見出しに対象パスを明記する: `### 変更前 (app/orders/page.tsx)` / `### 変更後 (app/orders/page.tsx)`。画像自体にページ名バナーは焼き込まない(下記参照)

## できないこと(先に把握する)

`gh` CLIにはPR本文への画像アップロード機能がなく、Claude Codeのブラウザ自動化ツールにもファイルアップロード操作がない。したがって**PR本文への貼り付けは人間の手作業になる**。このスキルがやるのは、注釈付きPNGをファイルとして`SendUserFile`で渡すところまで。この制約を回避しようとして時間をかけない。

## なぜ撮影と注釈を分けるか

矢印+固定座標のオーバーレイをDOM注入して都度スクリーンショットを撮る方式は、見た目を1つ直すたびにブラウザ再起動・ログイン・DBリセットが必要になり非常に遅い(実際にPR #119で数十分溶かした)。撮影(重い・1回)と注釈(軽い・何度でも)を分離すれば、見た目調整は1秒未満で回せる。

## Quick start

```bash
cd .claude/skills/pr-screenshot/scripts
npm install   # 初回のみ
```

1. **撮影フェーズ(1回だけ)**
   - `supabase db reset` でDBをクリーンにする
   - devサーバーを起動する(`preview_start`。Bashで直接起動しない)
   - `scripts/capture-template.js` を `capture.js` としてコピーし、対象ページの操作(フォーム入力・クリック)とハイライトしたい要素の`getBoundingClientRect()`取得ロジックを書き込む(テンプレート内のコメント参照)
   - 実行: `TARGET_PATH=/admin/coupons SUPABASE_SERVICE_ROLE_KEY=<supabase status の値> node capture.js`
   - `raw_*.png` と `rects.json` ができる

2. **注釈フェーズ(何度でも編集可)**
   - `boxes`(対象rect・色・ラベル文言)を指定する小さな呼び出しスクリプト、またはJSON設定ファイルを書き、`annotate.js`の`buildAnnotated()`を呼ぶ(`page`は省略してよい。ページ名バナーは付けない運用にしたため)
   - 見た目が気に入るまで`node annotate.js <config.json>`を繰り返す(ブラウザ・DB不使用、高速)

3. `SendUserFile`で`annotated_*.png`を送る。PR本文への貼り付けはユーザーに依頼する

## 実装前UIモックの撮影(capture-mock-template.js)

実装後のPRスクショとは別に、**実装前のUIモック**(`design`スキルで作ったArtifactやローカルの`.dc.html`)を撮る軽量版がある。ログイン・Supabase Admin API・DBリセットは一切不要(モックは静的ページのため)。

```bash
cp capture-mock-template.js capture-mock.js
MOCK_URL=./design-mock/Main.dc.html node capture-mock.js   # ローカルファイル
```

- **`design`スキルのArtifact URL(`claude.ai/code/artifact/...`)は基本的に開けない**（実機で確認済み）。designスキルが公開する前にローカルへ生成する完全なhtmlファイル(`seed-canvas.mjs --out`で指定したパス)を`MOCK_URL`に指定すること。Artifact URLは非公開ページのため、ログインセッションを持たないこのスクリプトの起動先ブラウザからは「Page not found」になる
- **design skillのartboardはsandboxed iframe内でレンダリングされる**。要素のハイライト用にrectを取る場合は、`capture-mock-template.js`内のコメントにある通り`iframe`の`contentFrame()`経由で取得し、`iframe`自体の位置を加算して絶対座標に変換すること。トップレベルの`document.querySelector()`では見つからない。iframeのマウントには数秒かかるため、`goto`後は最低5〜6秒sleepしてから撮影する
- `raw_mock.png`ができたら`annotate.js`で注釈する。ページ名バナーは付けない。実装前モックだと分かるようにしたい場合は、貼り付け先(PR本文・SPEC.md)の見出し側に「変更後(実装前モック、対象: /orders)」のように明記する
- 仕様書(`docs/spec/<機能名>/SPEC.md`)に貼るafter画像として使う。before画像(既存ページの現状)は通常の`capture-template.js`で撮る
- **クリックで状態が変わるモック**(処理中表示・完了メッセージ・空表示など)は、この静的1枚撮りでは「クリック後」を撮れない。次の`mock-capture.js`を使う

## インタラクティブモックの状態撮影(mock-capture.js)

`design`スキルで`is_interactive: true`にしたartboardや、`<script>`で状態が変わる素のhtmlを、**状態ごとに撮る**ためのヘルパー(`openMock()`)。`feature-proposal`Role 3の「状態設計」(通常/処理中/成功/エラー/権限なし/空)のうち、モック上で再現できる状態を文字の表ではなく画像で残すのが目的。ログイン・DB不要。

```js
// scripts/capture-mock-<機能名>.js として置く(使い捨て。.gitignore済み)
const { openMock } = require('./mock-capture.js');
(async () => {
  const m = await openMock('/abs/path/to/seeded.html', { artboardIndex: 1, outDir: __dirname });
  console.log('iframeCount =', m.iframeCount);   // 期待したartboard数か必ず確認する
  await m.shoot('raw_idle');                      // 通常
  await m.clickText('削除');                       // frame内のテキストでクリック(同文言が複数なら {nth})
  await m.shoot('raw_processing');                // 処理中
  await m.sleep(1200);
  await m.shoot('raw_done');                      // 成功
  await m.writeRects({ target: await m.rect('button') }); // annotate.js用の絶対座標(任意)
  await m.close();
})();
```

- `openMock(path, { artboardIndex, outDir, viewport })`は`{ frame, shoot, clickText, rect, writeRects, sleep, iframeCount, close }`を返す。`frame`はpuppeteerの`Frame`なので、`clickText`で足りない操作は`frame.type()`等を直接使ってよい
- クリック・待機の組み立てはモックごとに違うので、都度短いスクリプトを書く。実装で使うテストコードではなく、**実装前モック撮影のためだけの使い捨て**でよい
- **Before/Afterを1キャンバスに並べた場合(iframeが複数)は要注意**: DOM順は`canvas.json`のartboards配列の順と一致するとは限らない。`artboardIndex`(0始まり)で対象を明示し、`shoot()`の画像を**必ず目視確認**してから使う(狙いと違うartboardを撮っていても気づかず進めてしまった実例がV組まい側であった。詳細は[known-failure-patterns.md](../../../docs/agents/known-failure-patterns.md))
- `rect()`はiframeのオフセットを加算した絶対座標を返すので、そのまま`annotate.js`の`boxes[].rect`に渡せる(座標変換は不要)
- `designスキル`のArtifact URLは開けない(上記と同じ理由)。`seed-canvas.mjs --out`で生成したローカルhtmlを渡す
- 動作確認済みの環境: puppeteer-core 25.9 + macOS Chrome、`sandbox="allow-scripts"`のiframe内クリック・要素取得・クリップ撮影(2026-09-04)

## capture-template.jsのパラメータ

環境変数で最低限パラメータ化してある:

- `TARGET_PATH`(必須): 撮影対象ページのパス。例 `/admin/coupons`
- `BASE_URL`: 省略時 `http://localhost:3000`
- `REQUIRE_ADMIN`: 管理者ログインが不要なページは `false` にする(省略時 `true`)
- `SUPABASE_SERVICE_ROLE_KEY`: `supabase status` の出力から取得。admin権限付与に使う
- `SHOT_EMAIL`: マジックリンクログインに使うメールアドレス(省略時ダミーアドレス)
- `CHROME_PATH`: システムのChrome実行ファイルパス(省略時 macOSデフォルト)

**重要**: `app_metadata`をSupabase Admin APIで更新しても、既存セッションのJWTには反映されない(トークン発行時点のスナップショットのため)。`capture-template.js`の`grantAdmin()`は権限付与後に必ず再ログインする——このロジックを書き換えて省略しない。

## annotate.jsのAPI

```js
const { buildAnnotated } = require('./annotate.js');

await buildAnnotated({
  rawPngPath: 'raw_created.png',
  outPngPath: 'annotated_created.png',
  viewport: { width: 1280, height: 800 },       // capture時のdefaultViewportと一致させる
  boxes: [
    { rect: { x, y, width, height }, color: '#e11d48', text: '① 新規追加: クーポン管理ページ' },
  ],
});
```

- `rect`は撮影時にブラウザの実ビューポート座標系(`getBoundingClientRect()`)で取得した値をそのまま渡す。座標変換は不要
- ラベルは対象要素の**直下**に自動配置され、重なる場合は自動的に上へ積み上げる。矢印は使わない(要素を直接囲む枠線の方がズレようがなく確実)
- テーブルの行(`tr`)を囲みたい場合、`outline`が行全体として視認しづらいことがある。その場合は行の代わりに各セル(`td`)のrectを個別に渡すか、行の外側にひとまわり大きいdivを想定してrectを渡す
- `page: { title, path }`は省略可能な旧オプション(画像上部にページ名バナーを焼き込む)。デフォルトでは付けない。対象パスはPR本文・SPEC.mdの見出しに書く運用にしたため、通常は指定しない

## 完了したら

- `supabase db reset` でテストデータ(ダミーユーザー・作成したレコード)を消す
- devサーバーを`preview_stop`で止める
- `scripts/`配下の`raw_*.png`・`annotated_*.png`・`rects.json`はスキルの成果物ではなく一時ファイルなので、コミットしない(`.gitignore`済み)
