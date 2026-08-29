// PR用スクリーンショットの注釈エンジン(汎用・riff-gear非依存)。
// 生PNG + 要素座標(rect)から、枠線・ラベル・ページ名バナーを合成した
// PNGを作る。ブラウザもDBも使わないため、見た目が気に入るまで
// 何度でも高速に(1秒未満で)再実行できる。
//
// 使い方(モジュールとして):
//   const { buildAnnotated } = require('./annotate.js');
//   await buildAnnotated({
//     rawPngPath: 'raw_created.png',
//     outPngPath: 'annotated_created.png',
//     viewport: { width: 1280, height: 800 },
//     page: { title: '管理画面 - クーポン管理', path: '/admin/coupons' },
//     boxes: [
//       { rect: { x, y, width, height }, color: '#e11d48', text: '① 説明' },
//     ],
//   });
//
// boxes[].rect は撮影時にブラウザの実ビューポート座標系(getBoundingClientRect)で
// 取得したものをそのまま渡す。ラベルは常に対象要素の直下に置かれ、
// 重なる場合は自動的に上へ積み上げる。
const fs = require('fs');
const sharp = require('sharp');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 全角(日本語等)と半角(英数記号)で幅を分けて概算する。14pxフォント基準。
function textWidth(text) {
  let w = 0;
  for (const ch of text) {
    w += /[\x00-\xff]/.test(ch) ? 8 : 15;
  }
  return w;
}

function labelBox(text, x, y, color) {
  const paddingX = 10;
  const boxW = Math.round(textWidth(text)) + paddingX * 2;
  const boxH = 26;
  return `
    <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="5" fill="${color}" />
    <text x="${x + paddingX}" y="${y + boxH / 2 + 5}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#fff">${esc(text)}</text>
  `;
}

// tr要素はoutlineが行全体として視認しづらいことがあるため、呼び出し側で
// 個々のtd rectを渡すか、tag情報があれば分割するかは呼び出し側の責務とする
// (このモジュールはrectのリストを受け取るだけのシンプルな設計にする)。
function frameRect(r, color, padding) {
  const p = padding == null ? 3 : padding;
  return `<rect x="${r.x - p}" y="${r.y - p}" width="${r.width + p * 2}" height="${r.height + p * 2}" fill="none" stroke="${color}" stroke-width="3" rx="4" />`;
}

// 重ならないようラベル位置を上下にずらす簡易スタッキング
function placeLabels(items) {
  const placed = [];
  return items.map((it) => {
    let top = it.top;
    for (const p of placed) {
      const overlapsX = it.left < p.right && it.left + it.approxWidth > p.left;
      const overlapsY = Math.abs(top - p.top) < 34;
      if (overlapsX && overlapsY) top = p.top - 34;
    }
    placed.push({ left: it.left, right: it.left + it.approxWidth, top });
    return { ...it, top };
  });
}

const BANNER_HEIGHT = 40;

async function buildAnnotated({ rawPngPath, outPngPath, viewport, page, boxes }) {
  const { width, height } = viewport;
  const svgParts = [];

  // ページ名バナー: 元のUIと絶対に重ならないよう、画像の高さ自体を
  // bannerHeight分拡張してその領域に描く。
  svgParts.push(`
    <rect x="0" y="0" width="${width}" height="${BANNER_HEIGHT}" fill="#111827" />
    <text x="16" y="${BANNER_HEIGHT / 2 + 5}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#fff">${esc(page.title)}</text>
    <text x="${width - 16}" y="${BANNER_HEIGHT / 2 + 5}" font-family="monospace" font-size="13" fill="#9ca3af" text-anchor="end">${esc(page.path)}</text>
  `);

  // ラベルは常に対象要素の"直下"に置く(上に置くと見出し等と衝突しやすいため)。
  const labelItems = boxes.map((b) => {
    const approxWidth = textWidth(b.text) + 20;
    return {
      text: b.text,
      left: Math.max(4, Math.min(b.rect.x, width - approxWidth - 4)),
      top: b.rect.y + b.rect.height + 8 + BANNER_HEIGHT,
      approxWidth,
      color: b.color,
    };
  });
  const placed = placeLabels(labelItems);

  for (const b of boxes) {
    const shifted = { ...b.rect, y: b.rect.y + BANNER_HEIGHT };
    svgParts.push(frameRect(shifted, b.color, b.padding));
  }
  for (const l of placed) {
    svgParts.push(labelBox(l.text, l.left, l.top, l.color));
  }

  const svg = `<svg width="${width}" height="${height + BANNER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">${svgParts.join('')}</svg>`;

  const base = await sharp({
    create: { width, height: height + BANNER_HEIGHT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: rawPngPath, top: BANNER_HEIGHT, left: 0 }])
    .png()
    .toBuffer();

  await sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outPngPath);
}

// CLIとしても使えるようにする:
//   node annotate.js <config.json>
// config.json は buildAnnotated() にそのまま渡す1件、または配列(複数枚まとめて処理)。
if (require.main === module) {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('usage: node annotate.js <config.json>');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const jobs = Array.isArray(config) ? config : [config];
  Promise.all(jobs.map(buildAnnotated))
    .then(() => console.log('annotate done'))
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { buildAnnotated };
