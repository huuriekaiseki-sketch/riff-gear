// UI仕様書用の「実装前モック」撮影テンプレート(認証不要・DB不使用)。
//
// capture-template.js との違い: モックは designスキルで作ったArtifact URL、または
// ローカルhtmlファイルを開くだけの静的ページなので、マジックリンクログインや
// Supabase Admin APIでのrole付与が一切不要。devサーバーもSupabase起動も要らない。
//
// このファイルはコピーして対象モック用に書き換えて使う「テンプレート」であり、
// 汎用モジュールではない。ハイライトしたい要素のセレクタはモックごとに変わるため。
//
// 環境変数:
//   TARGET_URL  例: https://claude.site/artifacts/xxxx または file:///path/to/mock.html (必須)
//   CHROME_PATH システムのChrome実行ファイルパス(省略時 macOSデフォルト)
//
// 使い方:
//   1. このファイルを同じディレクトリに mock-capture.js としてコピーする
//   2. 下の「ここを対象モックに合わせて書き換える」ブロックを編集する
//   3. TARGET_URL=<モックのURL> node mock-capture.js
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

  // ============================================================
  // ここを対象モックに合わせて書き換える
  // ============================================================
  //
  // 例(クーポン作成モックの場合):
  //
  // await page.screenshot({ path: path.join(OUT_DIR, 'raw_mock.png') });
  // const rects = await page.evaluate(() => {
  //   const btn = document.querySelector('[data-mock="create-button"]');
  //   const row = document.querySelector('[data-mock="new-row"]');
  //   const r1 = btn.getBoundingClientRect();
  //   const r2 = row.getBoundingClientRect();
  //   return {
  //     createButton: { x: r1.x, y: r1.y, width: r1.width, height: r1.height },
  //     newRow: { x: r2.x, y: r2.y, width: r2.width, height: r2.height },
  //   };
  // });
  //
  // fs.writeFileSync(
  //   path.join(OUT_DIR, 'rects.json'),
  //   JSON.stringify({ viewport, mock: rects }, null, 2)
  // );
  // ============================================================

  await browser.close();
  console.log('mock capture done');
})().catch((err) => { console.error(err); process.exit(1); });
