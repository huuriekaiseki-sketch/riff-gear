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
//     const m = await openMock('/abs/path/to/seeded.html', { artboardIndex: 1, outDir: __dirname, readySelector: 'table' });
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
// 撮った raw_*.png は annotate.js で枠・ラベルを合成できる(rect()は shoot() の画像座標系、
// writeRects() の viewport は画像サイズなので、そのまま annotate.js に渡せる)。
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
    // artboard内で「描画完了」とみなすセレクタ。designスキルのartboardは iframe が現れた後も
    // しばらく "Loading artboard…" のプレースホルダを表示するため、body直下の要素だけを
    // 待つと空のローディング画面を撮ってしまう(実機で発生)。撮りたい要素を指定する。
    readySelector = null,
    settleMs = 500,
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
    // artboard内の描画完了を待つ。readySelector指定時はその要素が出るまで待つ
    await frame.waitForSelector(readySelector || 'body > *', { timeout: mountWaitMs }).catch(() => {
      console.warn(`[mock-capture] readySelector "${readySelector || 'body > *'}" did not appear within ${mountWaitMs}ms; shooting anyway`);
    });
  } else if (readySelector) {
    await page.waitForSelector(readySelector, { timeout: mountWaitMs }).catch(() => null);
  }
  await sleep(settleMs); // フォント・アニメーションの初期描画を落ち着かせる

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

  // frame内で「そのテキストを含む最小のノード」を探し、最寄りのクリック可能要素に昇格してクリックする。
  // 同じ文言が複数あるときは nth で選ぶ。
  // WHY: ::-p-text() は条件分岐(<sc-if>)や<span>の中の文字だとテキストノード自体を返すことがあり、
  //      そのまま click() すると "Node is either not clickable or not an Element" で落ちる(実機で発生)。
  //      ボタンの中の<span>やSVG横のテキストを狙っても、親のbuttonをクリックするように寄せる。
  //      さらに、DCランタイムは <sc-if> の非表示側の分岐や hint 用の複製を DOM 上に残すことがあり、
  //      そちらが先にマッチすると bounding box が無く click できない。表示中のものだけを数える。
  async function clickText(text, { nth = 0 } = {}) {
    const handles = await frame.$$(`::-p-text(${text})`);
    const visible = [];
    for (const h of handles) {
      const target = await h.evaluateHandle((node) => {
        const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        return el.closest('button, a, [role="button"], input, select, summary, label') || el;
      });
      const el = target.asElement();
      if (!el) continue;
      const box = await el.boundingBox();
      if (!box || box.width === 0 || box.height === 0) continue;
      // 同じ要素に複数のテキストノードがヒットしても1回だけ数える
      const dup = await Promise.all(visible.map((v) => frame.evaluate((a, b) => a === b, v, el)));
      if (dup.some(Boolean)) continue;
      visible.push(el);
    }
    if (visible.length <= nth) {
      throw new Error(`clickText("${text}") matched ${visible.length} visible element(s) (${handles.length} raw), nth=${nth} not found`);
    }
    // WHY: designスキルのキャンバスは artboard(iframe) を CSS transform で縮小表示するため、
    //      puppeteer のマウスクリック(bounding box の中心座標へ送る)が実際の要素からずれ、
    //      ハンドラが発火しないことがある(実機で発生: onclick は配線済みなのに状態が変わらない)。
    //      モックの状態遷移を進めるのが目的なので、座標に依存しない DOM の click() を使う。
    await visible[nth].evaluate((el) => el.click());
  }

  // frame内の要素の rect を「shoot()で撮った画像の座標系」で返す(annotate.js用)。
  // WHY: shoot() は iframe(artboard) の領域にクリップして撮るので、画像の原点は iframe の左上。
  //      artboard内の getBoundingClientRect() はそのまま画像座標になる(オフセット加算は不要。
  //      メインページ座標に変換してしまうと annotate.js の枠が画像外にずれる。実機で確認)。
  //      iframe を持たない素の html の場合はページ全体を撮るので、これもそのまま一致する。
  async function rect(selector, { nth = 0 } = {}) {
    const handles = await frame.$$(selector);
    if (handles.length <= nth) {
      throw new Error(`rect("${selector}") matched ${handles.length} element(s), nth=${nth} not found`);
    }
    return handles[nth].evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    });
  }

  // annotate.js の viewport には「画像のサイズ」を渡す必要がある。iframe をクリップして撮った
  // 場合はブラウザのviewportではなく iframe の大きさが画像サイズになる
  async function imageSize() {
    if (!iframeHandle) return viewport;
    const box = await iframeHandle.boundingBox();
    return { width: Math.round(box.width), height: Math.round(box.height) };
  }

  async function writeRects(rects, fileName = 'rects.json') {
    const outPath = path.join(outDir, fileName);
    fs.writeFileSync(outPath, JSON.stringify({ viewport: await imageSize(), ...rects }, null, 2));
    return outPath;
  }

  async function close() { await browser.close(); }

  return { page, frame, iframeCount, viewport, imageSize, shoot, clickText, rect, writeRects, sleep, close };
}

module.exports = { openMock };
