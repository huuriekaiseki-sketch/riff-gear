// UI仕様書用の「実装前モック」撮影テンプレート(認証不要・DB不使用)。
//
// capture-template.js との違い: モックは designスキルで作ったArtifact URL、または
// ローカルhtmlファイルを開くだけの静的ページなので、マジックリンクログインや
// Supabase Admin APIでのrole付与が一切不要。devサーバーもSupabase起動も要らない。
//
// このファイルはコピーして対象モック用に書き換えて使う「テンプレート」であり、
// 汎用モジュールではない。ハイライトしたい要素のセレクタはモックごとに変わるため。
//
// 【重要】designスキルのArtifact URL(claude.ai/code/artifact/...)は非公開ページのため、
// 未ログインのpuppeteerでは開けず「Page not found」になる(実例で確認済み)。
// designスキルは公開前に、ローカルにseed済みの完全なhtmlファイル(seed-canvas.mjsの
// --out で指定したパス)を生成している。TARGET_URLにはArtifact URLではなく、
// そのローカルファイルを file:///絶対パス/xxx.html の形で指定すること。
//
// 【重要】Design Componentsのartboardはsandboxed iframe内でレンダリングされる。
// そのため要素のrectを取るには、通常のpage.evaluate()ではなく
// page.$('iframe').then(h => h.contentFrame()) で取得したフレームに対して
// evaluate()する必要がある(下記の書き換え例を参照)。またiframe自体のマウントに
// 数秒かかるため、goto後は最低5〜6秒程度sleepしてからスクリーンショットを撮ること。
//
// 環境変数:
//   TARGET_URL  例: file:///path/to/design/seed-output.html (必須。design skillのローカルseed出力、
//               またはそれ以外の静的ローカルhtml)
//   CHROME_PATH システムのChrome実行ファイルパス(省略時 macOSデフォルト)
//
// 使い方:
//   1. このファイルを同じディレクトリに mock-capture.js としてコピーする
//   2. 下の「ここを対象モックに合わせて書き換える」ブロックを編集する
//   3. TARGET_URL=<ローカルhtmlファイルのfile://パス> node mock-capture.js
//   4. raw_*.png と rects.json ができる。annotate.jsで注釈を合成する(何度でも編集可)
//      ページ名バナーには「(実装前モック)」等、実装前だと分かる表記を入れること
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TARGET_URL = process.env.TARGET_URL;
const OUT_DIR = __dirname;

if (!TARGET_URL) {
  console.error('TARGET_URL is required, e.g. TARGET_URL=https://claude.site/artifacts/xxxx node mock-capture.js');
  process.exit(1);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

(async () => {
  const viewport = { width: 1280, height: 800 };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: viewport });
  const page = await browser.newPage();

  await page.goto(TARGET_URL, { waitUntil: 'networkidle0' });
  await sleep(6000); // design skillのartboardがiframe内でマウントされるのを待つ

  // ============================================================
  // ここを対象モックに合わせて書き換える
  // ============================================================
  //
  // 例(design skillで作ったモックの場合。artboardはsandboxed iframe内にあるため、
  // 要素のrectはiframeのcontentFrame()経由で取得する):
  //
  // await page.screenshot({ path: path.join(OUT_DIR, 'raw_mock.png') });
  //
  // const iframeHandle = await page.$('iframe');
  // const iframeBox = await iframeHandle.boundingBox(); // メインページ上でのiframeの位置
  // const frame = await iframeHandle.contentFrame();
  // const rectsInFrame = await frame.evaluate(() => {
  //   const btn = document.querySelector('[data-mock="create-button"]');
  //   const row = document.querySelector('[data-mock="new-row"]');
  //   const r1 = btn.getBoundingClientRect();
  //   const r2 = row.getBoundingClientRect();
  //   return {
  //     createButton: { x: r1.x, y: r1.y, width: r1.width, height: r1.height },
  //     newRow: { x: r2.x, y: r2.y, width: r2.width, height: r2.height },
  //   };
  // });
  // // iframe内座標 + iframe自体のメインページ上でのオフセットを足して絶対座標にする
  // const rects = Object.fromEntries(
  //   Object.entries(rectsInFrame).map(([key, r]) => [
  //     key,
  //     { x: r.x + iframeBox.x, y: r.y + iframeBox.y, width: r.width, height: r.height },
  //   ])
  // );
  //
  // fs.writeFileSync(
  //   path.join(OUT_DIR, 'rects.json'),
  //   JSON.stringify({ viewport, mock: rects }, null, 2)
  // );
  //
  // design skill以外の、iframeを使わないシンプルな静的htmlの場合は
  // page.evaluate()をそのまま使ってよい(iframe座標変換は不要)。
  // ============================================================

  await browser.close();
  console.log('mock capture done');
})().catch((err) => { console.error(err); process.exit(1); });
