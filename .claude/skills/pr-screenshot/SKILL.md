---
name: pr-screenshot
description: riff-gearのUI変更を、枠線・ラベル・ページ名バナー付きのスクリーンショットとしてPR用に撮影する。撮影(puppeteer-core、ログイン込みで1回だけ)と注釈合成(sharp、ブラウザ不使用で何度でも編集可能)を分離しているため、見た目調整のたびにブラウザ再起動・DBリセット・ログインをやり直す必要がない。Use when UI変更を含むPRでスクリーンショットが必要なとき、「スクショ撮って」「PRに画像入れて」「見た目を確認したい」と言われたとき。
---

# PR用スクリーンショット撮影

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
   - `boxes`(対象rect・色・ラベル文言)と`page`(タイトル・パス)を指定する小さな呼び出しスクリプト、またはJSON設定ファイルを書き、`annotate.js`の`buildAnnotated()`を呼ぶ
   - 見た目が気に入るまで`node annotate.js <config.json>`を繰り返す(ブラウザ・DB不使用、高速)

3. `SendUserFile`で`annotated_*.png`を送る。PR本文への貼り付けはユーザーに依頼する

## 実装前UIモックの撮影(capture-mock-template.js)

実装後のPRスクショとは別に、**実装前のUIモック**(`design`スキルで作ったArtifactやローカルの`.dc.html`)を撮る軽量版がある。ログイン・Supabase Admin API・DBリセットは一切不要(モックは静的ページのため)。

```bash
cp capture-mock-template.js capture-mock.js
MOCK_URL=./design-mock/Main.dc.html node capture-mock.js   # ローカルファイル
# または
MOCK_URL=https://claude.ai/code/artifact/xxxx node capture-mock.js   # 公開Artifact URL
```

- `design`スキルの保存機能でプライベート公開したArtifact URLは、このブラウザにログインセッションが無いため開けないことが多い。その場合はローカルの`.dc.html`ファイルを直接指定する(静的な見た目の確認で足りる)
- `raw_mock.png`ができたら`annotate.js`で注釈する。ページ名バナーには「（実装前モック）〇〇」のように実装前だと分かる表記を入れ、実装後の`annotated_*.png`と混同しないようにする
- 仕様書(`docs/specs/`)に貼るafter画像として使う。before画像(既存ページの現状)は通常の`capture-template.js`で撮る

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
  page: { title: '管理画面 - クーポン管理', path: '/admin/coupons' },
  boxes: [
    { rect: { x, y, width, height }, color: '#e11d48', text: '① 新規追加: クーポン管理ページ' },
  ],
});
```

- `rect`は撮影時にブラウザの実ビューポート座標系(`getBoundingClientRect()`)で取得した値をそのまま渡す。座標変換は不要
- ラベルは対象要素の**直下**に自動配置され、重なる場合は自動的に上へ積み上げる。矢印は使わない(要素を直接囲む枠線の方がズレようがなく確実)
- テーブルの行(`tr`)を囲みたい場合、`outline`が行全体として視認しづらいことがある。その場合は行の代わりに各セル(`td`)のrectを個別に渡すか、行の外側にひとまわり大きいdivを想定してrectを渡す
- ページ名バナーは画像の高さを拡張して描画するため、元のUIと重ならない

## 完了したら

- `supabase db reset` でテストデータ(ダミーユーザー・作成したレコード)を消す
- devサーバーを`preview_stop`で止める
- `scripts/`配下の`raw_*.png`・`annotated_*.png`・`rects.json`はスキルの成果物ではなく一時ファイルなので、コミットしない(`.gitignore`済み)
