# PR用スクリーンショットの撮影と注釈

UI変更のPRで「何がどう変わったか」を一目で伝えるための、矢印・ラベル付きスクリーンショットの撮り方。PR #119（管理者向けクーポン管理画面）で試行し、うまくいった手順をここに残す。

## できないこと（先に明記する）

`gh` CLIにはPR本文への画像アップロード機能がない。GitHub側の画像アップロードはブラウザのドラッグ&ドロップ／クリップボード貼り付けが前提で、この制約はブラウザ自動化ツール（Claude Browser）側にもファイルアップロード操作がないため回避できない。

したがって**PR本文への貼り付けは人間の手作業が必要**。Claude Codeは以下を行う:

1. 注釈付きスクリーンショットを撮り、会話内（ツール結果）で提示する
2. `gh pr create`のPR本文には「スクリーンショットは別途貼り付け」等の一言を残す、または後から人間が編集する前提にする

「完全自動化できない」こと自体は仕様であり、回避策を探して時間をかけない。

## 手順

前提: `preview_start`でdevサーバーが起動済み、対象ページが表示されていること。

### 1. 注釈対象の座標を取得する

`javascript_tool`でDOM要素の`getBoundingClientRect()`を読む。座標系はブラウザの実ビューポート（例: 1280x720）であり、`computer`のスクリーンショット画像サイズ（例: 800x450）とは異なることに注意。ただし**変換は不要**——次のステップで`position:fixed`の注釈をこの実座標系のまま配置すれば、スクリーンショットは自動的に縮小されて正しい位置に描かれる。

```js
function rectOf(text, tag) {
  const els = Array.from(document.querySelectorAll(tag || '*'));
  const el = els.find(e => e.children.length === 0 && e.textContent.trim() === text);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
JSON.stringify({ target: rectOf('対象テキスト', 'a') });
```

テーブルの特定行など動的な要素は`querySelectorAll('tbody tr')`から`textContent.includes(...)`で絞り込む。列位置は`thead th`のrectを使うと正確。

### 2. 注釈レイヤーを注入する

`javascript_tool`で`position:fixed`のオーバーレイ層を1つ作り、その中に矢印（SVG）とラベル（div）を追加する。レイヤーには固定IDを付け、再実行時は先に削除してから作り直す（重複防止）。

```js
(function() {
  document.getElementById('annotation-layer')?.remove();
  const layer = document.createElement('div');
  layer.id = 'annotation-layer';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999999;font-family:sans-serif;';
  document.body.appendChild(layer);

  function label(text, left, top, color) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = `position:fixed;left:${left}px;top:${top}px;background:${color};color:#fff;padding:6px 10px;border-radius:6px;font-size:14px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,.3);white-space:nowrap;`;
    layer.appendChild(d);
  }
  function arrow(x1, y1, x2, y2, color) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:fixed;left:0;top:0;width:100%;height:100%;overflow:visible;');
    const markerId = 'arrowhead-' + Math.random().toString(36).slice(2);
    svg.innerHTML = `<defs><marker id="${markerId}" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${color}"/></marker></defs><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" marker-end="url(#${markerId})"/>`;
    layer.appendChild(svg);
  }

  arrow(400, 100, 400, 150, '#e11d48');
  label('① 変更点の説明', 250, 70, '#e11d48');
})();
```

番号付き（①②③…）にして、PRの説明文と対応させると読みやすい。色は要素ごとに変える（例: 新規追加=赤、変更=紫、確認ポイント=緑）。

### 3. スクリーンショットを撮る

`computer`の`screenshot`アクションで撮影する。ツール結果の画像がそのまま会話に表示されるので、ユーザーはこの時点で確認できる。

### 4. ラベルの重なりに注意する

複数のラベルを近い位置に置くと重なって見えなくなることがある（実際に発生した）。原因はテキスト幅を見込まずに固定座標を計算したこと。対策:

- 注釈注入後に`document.getElementById('annotation-layer').children`を`getBoundingClientRect()`で読み、実際の描画位置とサイズを確認してから調整する
- ラベル同士の`left`/`top`を最低120px程度離す
- スクリーンショットの画像サイズ（例800px幅）を超える`left`値を使わない（ビューポート座標系がスクショの実ピクセル幅より大きい場合、右端に置いたラベルが切れる）

### 5. 注釈を消して元の状態に戻す

Critic検証（`git diff`確認・E2Eの再現性確認）やスクリーンショットの撮り直しのために、都度クリアする。

```js
document.getElementById('annotation-layer')?.remove();
```

PRとしてコミットするコードには注釈レイヤーのコードは含まれない（`javascript_tool`はブラウザのランタイムに対してのみ実行され、ソースファイルは変更しない）。

## 実例

PR #119では、クーポン管理画面の「作成後」「無効化後」の2状態それぞれに①〜⑤の番号付き矢印・ラベルを重ねてスクリーンショットを撮り、会話内で提示した。ユーザーが`gh pr create`後にGitHub UI上でPR本文へドラッグ&ドロップした。
