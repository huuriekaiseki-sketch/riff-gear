# 変更レイヤーに応じたテスト選択の機械的担保

## 背景

order_items.price_cents_at_order のCHECK制約漏れ（PR #115で後追い修正）のように、
「変更した層に対応する肝心なテストが選ばれない」事故が繰り返し起きた。
原因は、テスト要否の判断が実装者・レビューアの記憶と裁量に委ねられていたこと。
レビューアに「テスト網羅性を見て」と抽象的に指示すると判断がぶれるため、
**何のテストが必要かの判断を機械化し、レビューアには存在確認だけをさせる**。

## 仕組み（aidd-phase2ワークフローに組み込み）

3段階で「必要なテスト」を導き、レビューの第5観点「テスト選択」で検証する。

1. **パスからの機械判定**: 実装者が報告した changedFiles のパスから変更レイヤーを判定する
   （例: `lib/**.ts` → [unit] 必須、`supabase/migrations/` → [migration] 推奨）
2. **リスク自己申告**: パスから読み取れない意味的リスクだけを実装者が構造化スキーマで申告する
   （`risks` フィールド・必須。enumで縛るため自由記述のぶれが無い）
3. **レビューアの存在確認**: 導出された必須テスト種別について「対応するテストが実在するか」だけを確認する。
   既存テストが変更内容をカバー済みなら根拠パスつきでpass、AAAのAssertが最終状態まで届いているかも見る

仕様段階（Phase1/SPEC相当）でテスト方針を先に決めた場合は `specTests` 引数で渡す。
実装時の導出結果との**和集合**が必須になる（どちらの見落としも互いに補う。
過剰になった分はレビューアが「既存テストでカバー済み」等の根拠つきで免除できる）。

**正本は [.claude/workflows/aidd-phase2.js](../../.claude/workflows/aidd-phase2.js) の
`TEST_TYPES` / `RISK_RULES` / `deriveTestSelection()`。** 以下の表は解説用の写しであり、
食い違ったらJS側が正しい。回帰テストは
[scripts/aidd-phase2-workflow.test.sh](../../scripts/aidd-phase2-workflow.test.sh)（CIのhooks-testで常時実行）。

## リスク申告キー → 必須テスト種別（写し）

| リスクキー | 申告する条件 | 必須になるテスト |
|---|---|---|
| schema_change | テーブル・カラム・CHECK・UNIQUE・FK・NOT NULLの追加/変更 | [DB制約]（+[migration]推奨） |
| authz_change | RLSポリシー・GRANT・ロール・閲覧範囲の変更 | [RLS] |
| rpc_change | RPC関数・トリガーの追加/変更 | [RPC統合] |
| atomicity | 複数テーブル・複数行を1業務処理として更新（全成功or全失敗） | [transaction] |
| retry_possible | 二重クリック・再送があり得る処理（注文・決済・Webhook・取消） | [idempotency] |
| contention | 在庫・予約・残高・利用上限など同時実行の競合 | [concurrency] |
| external_api | 決済・メール・配送など外部API呼び出し | [fault] |
| complex_logic | 入力パターン・操作順が多い計算/状態遷移 | [property] |
| personal_data | 個人情報・CSV出力・ログ出力に関わる変更 | [privacy]（未整備のため推奨扱い） |

## パス → テスト種別（写し）

| 変更パス | 導出 |
|---|---|
| `lib/**.ts(x)` | [unit] 必須 |
| `supabase/migrations/**` | [migration] 推奨。DB系リスク（schema_change/authz_change/rpc_change）が未申告なら「申告漏れ疑い」をレビューアに通知 |
| `app/api/**`・`**/route.ts`・`**/actions.ts` | [API統合]・[契約] 推奨 |
| `app/**.tsx` | [UI]・[a11y] 推奨 |

静的3種（typecheck / lint / production build）はintegratorが毎回実行するため対象外。

## 必須とfailの境界（established）

テスト基盤が `tests/` 配下に整備済みの種別だけが「無いとレビューfail」の必須になれる。
未整備の種別は自動的に「推奨」へ降格し、レビュー結果に表示されるがfail要因にはならない。

- **整備済み（必須になれる）**: [unit] [property] [DB制約] [RLS] [RPC統合] [transaction] [idempotency] [concurrency] [fault]
- **未整備（推奨止まり）**: [migration] [API統合] [契約] [UI] [a11y] [E2E] [privacy]

### 昇格手順

未整備種別のテスト基盤（ディレクトリ＋最初のテスト＋実行手順）を整備したら:

1. `aidd-phase2.js` の `TEST_TYPES` で該当キーの `established` を `true` にし、`hint` を実ディレクトリに更新する
2. この文書の写しを更新する
3. `scripts/aidd-phase2-workflow.test.mjs` に昇格後の導出ケースを追加する

## 判断がぶれたときの調べ方

- 「なぜこのテストが必須と言われたのか」→ レビュー結果の `testSelection`（required/recommended/risks）と
  `deriveTestSelection()` を読む。導出は決定的なので再現できる
- 「必須が過剰では」→ レビューアが根拠つきで免除した記録（detail）を確認。恒常的に過剰なら
  `RISK_RULES` / パス規則自体を直す（レビューアの裁量を広げる方向で直さない）
