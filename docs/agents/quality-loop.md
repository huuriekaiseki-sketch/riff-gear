# 品質ループと昇格基準

riff-gearの品質の仕組み（テスト・テンプレート・スキル・hooks）を「自分で学習する循環」として回すためのルール。個別のチェック項目ではなく、**チェック項目を増やす/増やさないの判断基準**を定める。

## 5段階の位置づけ

| 段階 | 目的 | riff-gearでの実体 |
|---|---|---|
| 見える化 | 状態を把握する | PRテンプレートの検証欄・制約欄、CIログ |
| 再現化 | 同じ確認を繰り返せる | tests/、tests/helpers/、docs/agents/implementation-patterns.md |
| 自動化 | 忘れても実行される | CI（build/test/lint/typecheck/hooks-test）、RLS回帰テスト、migration検証 |
| フィードバック化 | 実行結果で仕組みを改善する | 学びの置き場判定（下記）、振り返り |
| 共有資産化 | 人・セッションが替わっても回る | skills、docs/agents/、PRテンプレート、known-failure-patterns.md |

## 昇格基準（最重要）

チェック項目・テスト・ルールは際限なく増やさない。次の3条件のうち**2つ以上**を満たすものだけを型・自動化に昇格させる:

1. **繰り返し起きる** — 同じ確認・同じハマりが2〜3回発生した（1回目は記録だけ、先回りで型を作らない）
2. **失敗時の影響が大きい** — 本番障害・データ不整合・認可漏れにつながる
3. **判断がぶれやすい** — 人・セッション・気分によって結果が変わる（例: 「検証済み」の粒度）

昇格の実例: curlによるRLS手動検証 →（マイグレーション変更で回帰する＋認可漏れは影響大）→ tests/rls/の自動テスト化を完了条件に昇格（PR #83）。

見送りの実例: RLSテストのfixture化 → 繰り返しがまだ2回のため、発生ベースのイシューとして保留。

### 見送りissueのタイトル規約

条件付きで見送るissueのタイトルには、「(条件付き)」のような抽象的な注記ではなく、着手条件そのものを「〜たら/〜になったら」の形で埋め込む。一覧(`gh issue list`)を見ただけで、本文を開かずに着手条件が分かるようにするため。

- 悪い例: `feat: レビュー自己投票の禁止化(条件付き・PR #86の既知制約)`
- 良い例: `feat: レビュー自己投票の悪用が実害化したら禁止ポリシーを追加する`

本文の「着手条件」欄には引き続き詳細を書く。タイトルはその要約であり、着手条件を変更したらタイトルも合わせて更新する。

## 学びの置き場判定

障害・CI失敗・レビュー指摘・実装中のハマりが起きたら、**修正と同時に「どこに留めるか」を1行決める**（feature-proposal skillのRole 6に組込済み）。選択肢:

- **テスト** — 再発を機械が検知すべきもの（回帰・境界値）。どの種別のテストを選ぶかは[layer-test-selection.md](layer-test-selection.md)の対応表に従う
- **スキル / テンプレート** — 作業手順・判断の型として毎回効かせるもの
- **docs/agents/known-failure-patterns.md** — 落とし穴の記録（型化はまだ早いもの）
- **docs/agents/implementation-patterns.md** — 再利用可能な実装手順
- **どこにも留めない** — 一回性と判断した場合（その判断自体は正当。ただし2回目が来たら昇格）

置き場に迷ったら昇格基準に照らす。基準を満たさないものを義務化しないことも、この判定の役割である。

## 現在地

作業に着手する前に、対象・テスト方針・完了条件を1枚にまとめてから進めるための欄。
更新のたびに上書きする（履歴が必要な場合はこのファイルのgit historyを見る）。

_最終更新: 2026-08-29（Codexレビュー対応セッション）_

### 直前に完了した項目

P1-2: 注文明細・注文合計のDB制約を補強する

- 対象: `order_items.price_cents_at_order >= 0`、`orders.total_cents >= 0`、
  `unique(order_id, product_id)`
- 変更: [0028_order_amount_constraints.sql](../../supabase/migrations/0028_order_amount_constraints.sql)
- テスト: `tests/constraints/order-amount-constraints.test.ts`を新規追加。
  `supabase db reset`でmigration適用を確認し、既存の`tests/rpc/cancel_order.test.ts`
  含む全162件・typecheck・lint・production buildがパスすることを確認済み
- migration安全性: 制約追加前の不正データ(`total_cents=-500`)を挿入した状態で
  0028を適用すると、サイレントに無視されず`ERROR: check constraint ... is violated
  by some row (SQLSTATE 23514)`で明示的に失敗することを一時マイグレーションで検証
  (検証用ファイルは削除済み、最終状態はクリーン)

参考(誤診断だったP0-1の経緯): `place_order()`の冪等キー機構は既に8/26のPR #102で
実装済みだった。詳細と再発防止策は[known-failure-patterns.md](known-failure-patterns.md)の
「レビュー・引き継ぎ情報を鵜呑みにした誤診断」を参照

### 次に着手する項目（Codexレビュー由来、未着手）

- P0-2: 決済RPC直叩き対策（実決済統合のタイミングでまとめて設計）
- P1-1: admin直接UPDATEの制限（専用RPCへの集約、不変列保護トリガー）
- P1-3: ユーザー削除時のカスケード削除による在庫不整合
- P1-4: クーポン適用結果（コード・割引額）の注文への未保存
- P2-1: クーポンコードの匿名ユーザー全件SELECT公開
- P2-2: `total_cents = 0`による空カート判定と0円商品の矛盾
- P2-3: `SECURITY DEFINER`関数の`search_path`/EXECUTE権限の明示不足
- P2-4: `order_items(order_id)`のインデックス欠如
