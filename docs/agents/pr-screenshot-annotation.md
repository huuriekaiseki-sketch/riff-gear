# PR用スクリーンショットの撮影と注釈

UI変更のPRで「何がどう変わったか」を一目で伝えるためのスクリーンショットの撮り方。**実装本体は[pr-screenshotスキル](../../.claude/skills/pr-screenshot/SKILL.md)にある。このファイルは経緯と教訓の記録。**

## できないこと（先に把握する）

`gh` CLIにはPR本文への画像アップロード機能がなく、Claude Codeのブラウザ自動化ツールにもファイルアップロード操作がない。したがって**PR本文への貼り付けは人間の手作業になる**。Claude Codeがやるのは、注釈付きPNGをファイルとして`SendUserFile`で渡すところまで。この制約を回避しようとして時間をかけない。

## ここに至るまでの経緯（PR #119）

最初は`javascript_tool`でDOM上に矢印・ラベルをposition:fixedで注入し、Browser MCPの`computer` screenshotで撮る方式を試した。うまく動いたように見えたが、2つの問題が判明した:

1. **`computer` screenshotの出力はツール結果として表示されるだけで、ファイルとしてユーザーに渡っていなかった**。「見えていましたか？」と確認したところ「見えてなかった」と判明。ダウンロード可能なファイルが必要なら、`puppeteer-core`(システムのChromeを操作)で`page.screenshot({path: ...})`により実ファイルとして保存する必要がある。
2. **矢印+固定座標のオーバーレイは、見た目を1つ直すたびにブラウザ再起動・ログイン・DBリセットが必要で著しく遅い**。ユーザーから「同じことをずっと繰り返してる」と指摘され、以下の設計に改めた。

## 現在の設計: 撮影と注釈の分離

- **撮影フェーズ(重い・1回だけ)**: `puppeteer-core`でログイン→対象ページに到達→**加工なしの生スクリーンショット**と、注釈対象要素の座標(`getBoundingClientRect()`)をJSONで保存する
- **注釈フェーズ(軽い・何度でも編集可)**: 生PNG+座標JSONに対して`sharp`で枠線・ラベル・ページ名バナーを合成する。ブラウザ・DB・ログインを一切使わないため、見た目調整は1秒未満で繰り返せる

さらにユーザーから2つの改善要望があり反映済み:

- 矢印による位置合わせはズレる事故が起きたため、**対象要素を直接枠で囲む**(outline)方式に変更した。要素自身に枠を当てるのでズレようがない
- PRを見る人が「これはどこの画面の変更か」を判別できるよう、**画像上部にページ名・URLパスのバナー**を必ず入れる

詳しい実装(スクリプトのAPI・環境変数・既知のハマりどころ)は[pr-screenshotスキルのSKILL.md](../../.claude/skills/pr-screenshot/SKILL.md)を参照。

## ワークフローとの連携

`aidd-phase2`ワークフロー([.claude/workflows/aidd-phase2.js](../../.claude/workflows/aidd-phase2.js))は、Review通過時の返り値に`result.uiChange`(changedFilesのパスから`app/**/page.tsx`の変更を機械判定した結果、`uiChanged`フラグと`pagePaths`候補を含む)を持つ。`feature-proposal`スキルのRole 4は、これが`true`ならpr-screenshotスキルの使用を開発者に確認する運用にしている。
