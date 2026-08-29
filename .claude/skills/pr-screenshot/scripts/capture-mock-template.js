// 実装前UIモックの軽量撮影テンプレート(認証不要・DB不使用)。
// designスキルで作ったArtifact URL、またはローカルの.dc.html/.htmlファイルを
// そのまま撮影する。capture-template.js(ログイン+Supabase Admin API前提)とは別物。
//
// 【重要】design skillのartboard(.dc.html)はsandboxed iframe内でレンダリングされる。
// そのため要素のrectを取るには、通常のpage.evaluate()ではなく、iframe要素の
// contentFrame()から得たフレームに対してevaluateし、iframe自体のメインページ上での
// 位置(boundingBox())を加算して絶対座標に変換する必要がある(下記の書き換え例を参照)。
// これをせずdocument.querySelector()をトップレベルドキュメントに対して実行すると、
// artboard内の要素は見つからない(実機で確認済み)。またiframeのマウントには数秒
// かかるため、goto後は最低5〜6秒sleepしてからスクリーンショットを撮ること。
//
// 環境変数:
//   MOCK_URL   撮影対象。http(s)://のURL、またはローカルファイルパス(自動でfile://化) (必須)
//
// 使い方:
//   1. このファイルを同じディレクトリに capture-mock.js としてコピーする
//   2. 下の「ここを対象モックに合わせて書き換える」ブロックでハイライトしたい要素の
//      getBoundingClientRect()取得ロジックを書く(不要なら省略してよい)
//   3. MOCK_URL=<Artifact URLまたはローカルパス> node capture-mock.js
//   4. raw_mock.png と rects.json ができる。annotate.jsで注釈を合成する(何度でも編集可)
//      ページ名バナーには「（実装前モック）〇〇」のように実装前だと分かる表記を入れること
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MOCK_URL = process.env.MOCK_URL;
const OUT_DIR = __dirname;

if (!MOCK_URL) {
  console.error('MOCK_URL is required, e.g. MOCK_URL=https://claude.ai/code/artifact/xxxx node capture-mock.js');
  console.error('  or MOCK_URL=./design-mock/Main.dc.html node capture-mock.js (ローカルファイル)');
  process.exit(1);
}

function resolveUrl(input) {
  if (/^https?:\/\//.test(input)) return input;
  return 'file://' + path.resolve(input);
}

// claude.aiのプライベートArtifact(design skillの保存機能が有効な場合)は
// ログインセッションが無いこのブラウザからは開けない。その場合は
// ローカルの.dc.html/.htmlファイルを直接指定する(静的な見た目の確認で足りるため)。
(async () => {
  const viewport = { width: 1280, height: 800 };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: viewport });
  const page = await browser.newPage();

  const url = resolveUrl(MOCK_URL);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await sleep(6000); // design skillのartboardがiframe内でマウントされるのを待つ

  // ============================================================
  // ここを対象モックに合わせて書き換える(ハイライトしたい要素があれば)
  // ============================================================
  //
  // design skillのモック(artboardがsandboxed iframe内にある)の場合:
  //
  // await page.screenshot({ path: path.join(OUT_DIR, 'raw_mock.png') });
  //
  // const iframeHandle = await page.$('iframe');
  // const iframeBox = await iframeHandle.boundingBox(); // メインページ上でのiframeの位置
  // const frame = await iframeHandle.contentFrame();
  // const rectsInFrame = await frame.evaluate(() => {
  //   const el = document.querySelector('button');
  //   const r = el.getBoundingClientRect();
  //   return { target: { x: r.x, y: r.y, width: r.width, height: r.height } };
  // });
  // // iframe内座標 + iframe自体のメインページ上でのオフセットを足して絶対座標にする
  // const rects = Object.fromEntries(
  //   Object.entries(rectsInFrame).map(([key, r]) => [
  //     key,
  //     { x: r.x + iframeBox.x, y: r.y + iframeBox.y, width: r.width, height: r.height },
  //   ])
  // );
  // fs.writeFileSync(path.join(OUT_DIR, 'rects.json'), JSON.stringify({ viewport, ...rects }, null, 2));
  //
  // design skill以外の、iframeを使わないシンプルな静的htmlの場合は、
  // page.evaluate()をそのまま使ってよい(iframe座標変換は不要):
  //
  // const rects = await page.evaluate(() => {
  //   const el = document.querySelector('button');
  //   const r = el.getBoundingClientRect();
  //   return { target: { x: r.x, y: r.y, width: r.width, height: r.height } };
  // });
  // fs.writeFileSync(path.join(OUT_DIR, 'rects.json'), JSON.stringify({ viewport, ...rects }, null, 2));
  //
  // ハイライト不要なら、下の1行だけでよい:
  await page.screenshot({ path: path.join(OUT_DIR, 'raw_mock.png') });
  // ============================================================

  await browser.close();
  console.log('capture-mock done');
})().catch((err) => { console.error(err); process.exit(1); });
