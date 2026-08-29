// PR用スクリーンショットの撮影テンプレート(riff-gear固有: マジックリンクログイン
// + Supabase Admin APIでのrole付与を前提とする)。
//
// このファイルはコピーして対象ページ用に書き換えて使う「テンプレート」であり、
// 汎用モジュールではない。対象ページごとに操作フロー(フォーム入力・クリック)や
// ハイライトしたい要素のセレクタが変わるため。
//
// 環境変数で最低限のパラメータ化はしてある:
//   TARGET_PATH   例: /admin/coupons (必須)
//   BASE_URL      例: http://localhost:3000 (省略時 http://localhost:3000)
//   REQUIRE_ADMIN 'true'/'false' (省略時 true。管理者権限が要らないページはfalseにする)
//
// 使い方:
//   1. このファイルを同じディレクトリに capture.js としてコピーする
//   2. 下の「ここを対象ページに合わせて書き換える」ブロックを編集する
//   3. supabase db reset で毎回クリーンな状態にしてから実行する(1回だけでよい)
//   4. node capture.js
//   5. raw_*.png と rects.json ができる。annotate.jsで注釈を合成する(何度でも編集可)
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TARGET_PATH = process.env.TARGET_PATH; // 例: '/admin/coupons'
const MAILPIT = process.env.MAILPIT_URL || 'http://127.0.0.1:54524';
const SUPABASE_API = process.env.SUPABASE_API_URL || 'http://127.0.0.1:54521';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // supabase status で確認
const REQUIRE_ADMIN = process.env.REQUIRE_ADMIN !== 'false';
const EMAIL = process.env.SHOT_EMAIL || 'pr-screenshot@example.com';
const OUT_DIR = __dirname;

if (!TARGET_PATH) {
  console.error('TARGET_PATH is required, e.g. TARGET_PATH=/admin/coupons node capture.js');
  process.exit(1);
}
if (REQUIRE_ADMIN && !SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required when REQUIRE_ADMIN=true (see: supabase status)');
  process.exit(1);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function countMessages() {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=10`);
  const data = await res.json();
  return (data.messages || []).filter((m) => m.To.some((t) => t.Address === EMAIL)).length;
}

async function latestMagicLink(sinceCount) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=10`);
    const data = await res.json();
    const msgs = (data.messages || []).filter((m) => m.To.some((t) => t.Address === EMAIL));
    if (msgs.length > sinceCount) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${msgs[0].ID}`).then((r) => r.json());
      const match = full.Text.match(/http:\/\/127\.0\.0\.1:\d+\/auth\/v1\/verify\?[^\s)]+/);
      if (match) return match[0];
    }
    await sleep(1000);
  }
  throw new Error('magic link not found in time (Mailpit: ' + MAILPIT + ')');
}

async function loginViaMagicLink(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.type('input[type=email]', EMAIL);
  const before = await countMessages();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
    page.click('button[type=submit]'),
  ]);
  const link = await latestMagicLink(before);
  await page.goto(link, { waitUntil: 'networkidle0' });
}

async function grantAdmin(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const userRes = await fetch(`${SUPABASE_API}/auth/v1/admin/users?email=${encodeURIComponent(EMAIL)}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const userData = await userRes.json();
  const user = (userData.users || [])[0];
  if (!user) throw new Error('user not found: ' + JSON.stringify(userData));
  await fetch(`${SUPABASE_API}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_metadata: { ...(user.app_metadata || {}), role: 'admin' } }),
  });
  // app_metadataの更新はJWTに即反映されない(トークン発行時点のスナップショットのため)。
  // 必ず再ログインしてJWTを更新すること。
  await loginViaMagicLink(page);
}

function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

(async () => {
  const viewport = { width: 1280, height: 800 };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: viewport });
  const page = await browser.newPage();

  await loginViaMagicLink(page);
  if (REQUIRE_ADMIN) await grantAdmin(page);

  await page.goto(`${BASE}${TARGET_PATH}`, { waitUntil: 'networkidle0' });

  // ============================================================
  // ここを対象ページに合わせて書き換える
  // ============================================================
  //
  // 例(クーポン管理画面の場合):
  //
  // await page.type('input[name=code]', 'WELCOME10');
  // await page.type('input[name=discount_percent]', '10');
  // await Promise.all([
  //   page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
  //   page.click('button[type=submit]'),
  // ]);
  // await sleep(300);
  //
  // await page.screenshot({ path: path.join(OUT_DIR, 'raw_state1.png') });
  // const rectsState1 = await page.evaluate(() => {
  //   const row = Array.from(document.querySelectorAll('tbody tr'))[0];
  //   const r = row.getBoundingClientRect();
  //   return { row: { x: r.x, y: r.y, width: r.width, height: r.height } };
  // });
  //
  // ...状態を進めるアクション...
  //
  // await page.screenshot({ path: path.join(OUT_DIR, 'raw_state2.png') });
  // const rectsState2 = await page.evaluate(() => { ... });
  //
  // fs.writeFileSync(
  //   path.join(OUT_DIR, 'rects.json'),
  //   JSON.stringify({ viewport, state1: rectsState1, state2: rectsState2 }, null, 2)
  // );
  // ============================================================

  await browser.close();
  console.log('capture done');
})().catch((err) => { console.error(err); process.exit(1); });
