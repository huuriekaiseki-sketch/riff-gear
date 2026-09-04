// インタラクティブな実装前UIモック(クリックで状態が変わるもの)を、状態ごとに撮影する
// 最小ヘルパー。capture-mock-template.js(静的1枚撮り)では「クリック後の状態」を撮れない
// ため、撮影を関数化してクリック→撮影→クリック→撮影を使い捨てスクリプトから回せるようにした。
//
// 設計上の前提(medical-inventory-vkumaiで先行運用したmock-capture.mjsをpuppeteer-coreへ移植):
//   - designスキルのartboard(.dc.html)はsandboxed iframe内に描画される。よってトップレベルの
//     document ではなく iframe の contentFrame() に対して操作・要素取得を行う
//   - Before/Afterを1キャンバスに並べると iframe が複数になる。DOM順は canvas.json の
//     artboards 配列の順と一致するとは限らない(違うartboardを撮ってしまった実例あり)。
//     そのため呼び出し側に artboardIndex を明示させ、iframeCount を返して目視確認を促す
//   - iframe の bounding box は撮影のたびに再取得する。状態遷移でartboardの高さが変わる
//     モックがあり、初回に固定した box を使い回すとズレる
//   - iframe を持たない素の静的html にも使える(その場合はページ全体を撮る)
//
// 使い方(使い捨てスクリプトを scripts/ 配下に capture-mock-*.js の名前で置く。.gitignore済み):
//
//   const { openMock } = require('./mock-capture.js');
//   (async () => {
//     const m = await openMock('/abs/path/to/seeded.html', { artboardIndex: 1, outDir: __dirname });
//     console.log('iframeCount =', m.iframeCount);        // 期待した数か確認する
//     await m.shoot('raw_idle');                           // 初期状態
//     await m.clickText('削除');                            // frame内のテキストでクリック
//     await m.shoot('raw_processing');                     // 処理中
//     await m.sleep(1200);
//     await m.shoot('raw_done');                           // 完了
//     await m.writeRects({ target: await m.rect('button') }, 'rects.json'); // annotate.js用(任意)
//     await m.close();
//   })();
//
// 撮った raw_*.png は annotate.js で枠・ラベルを合成できる(rect()はiframeオフセットを加算済みの
// 絶対座標を返すので、そのまま annotate.js の boxes に渡せる)。
//
// 環境変数:
//   CHROME_PATH    Chrome実行ファイル(省略時 macOSデフォルト)
//   MOCK_HEADFUL   "1" にすると実ブラウザ表示で動かす(デバッグ用。省略時ヘッドレス)
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function resolveUrl(input) {
  if (/^https?:\/\//.test(input)) return input;
  if (/^file:\/\//.test(input)) return input;
  return 'file://' + path.resolve(input);
}

async function openMock(htmlPath, opts = {}) {
  const {
    outDir = process.cwd(),
    viewport = { width: 1280, height: 900 },
    artboardIndex = 0,
    mountWaitMs = 8000,
  } = opts;
  if (!htmlPath) throw new Error('openMock(htmlPath) requires a path or URL');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.MOCK_HEADFUL === '1' ? false : true,
    defaultViewport: viewport,
  });
  const page = await browser.newPage();
  await page.goto(resolveUrl(htmlPath), { waitUntil: 'networkidle0' });

  // iframe(artboard)のマウントを待つ。iframeを持たない静的htmlなら待たずに進む
  await page.waitForSelector('iframe', { timeout: mountWaitMs }).catch(() => null);
  const iframes = await page.$$('iframe');
  const iframeCount = iframes.length;

  let iframeHandle = null;
  let frame = page;
  if (iframeCount > 0) {
    if (artboardIndex < 0 || artboardIndex >= iframeCount) {
      await browser.close();
      throw new Error(`artboardIndex=${artboardIndex} is out of range (iframeCount=${iframeCount})`);
    }
    iframeHandle = iframes[artboardIndex];
    frame = await iframeHandle.contentFrame();
    if (!frame) {
      await browser.close();
      throw new Error(`iframe #${artboardIndex} has no accessible content frame`);
    }
    // artboard内の描画完了を待つ(bodyに何か1要素でも入るまで)
    await frame.waitForSelector('body > *', { timeout: mountWaitMs }).catch(() => null);
  }

  async function frameOffset() {
    if (!iframeHandle) return { x: 0, y: 0 };
    const box = await iframeHandle.boundingBox();
    return { x: box.x, y: box.y };
  }

  async function shoot(name) {
    const outPath = path.join(outDir, `${name}.png`);
    if (iframeHandle) {
      const box = await iframeHandle.boundingBox(); // 毎回再取得(高さが変わるモック対策)
      await page.screenshot({ path: outPath, clip: box });
    } else {
      await page.screenshot({ path: outPath });
    }
    return outPath;
  }

  // frame内で「そのテキストを含む最小の要素」をクリックする。同じ文言が複数あるときは nth で選ぶ
  async function clickText(text, { nth = 0 } = {}) {
    const handles = await frame.$$(`::-p-text(${text})`);
    if (handles.length <= nth) {
      throw new Error(`clickText("${text}") matched ${handles.length} element(s), nth=${nth} not found`);
    }
    await handles[nth].click();
  }

  // frame内の要素の rect を、メインページ基準の絶対座標に変換して返す(annotate.js用)
  async function rect(selector, { nth = 0 } = {}) {
    const handles = await frame.$$(selector);
    if (handles.length <= nth) {
      throw new Error(`rect("${selector}") matched ${handles.length} element(s), nth=${nth} not found`);
    }
    const r = await handles[nth].evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    });
    const off = await frameOffset();
    return { x: r.x + off.x, y: r.y + off.y, width: r.width, height: r.height };
  }

  async function writeRects(rects, fileName = 'rects.json') {
    const outPath = path.join(outDir, fileName);
    fs.writeFileSync(outPath, JSON.stringify({ viewport, ...rects }, null, 2));
    return outPath;
  }

  async function close() { await browser.close(); }

  return { page, frame, iframeCount, viewport, shoot, clickText, rect, writeRects, sleep, close };
}

module.exports = { openMock };
