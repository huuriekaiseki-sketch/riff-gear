# ダミー決済機能 設計書

作成日: 2026-08-17

## 背景・目的

現状のチェックアウトフロー（`app/cart/checkout/route.ts` → `place_order()` RPC）には決済の概念が一切存在しない。カートの「注文する」を押すと在庫確定・注文確定が即座に行われるだけで、支払い方法の選択も支払いステータスの管理もない。

本設計は、実際の決済代行（Stripe等）を導入するのではなく、支払い方法の選択と支払いステータスの記録のみを追加するダミー決済機能を対象とする。決済は常に成功する前提とし、失敗シミュレーションは範囲外とする。

## 要件（ユーザー確認済み）

- リアリティ: 常に成功（失敗シミュレーションなし）
- 支払い方法: クレジットカード / 銀行振込 / 代金引換 の3択（入力フォームなし、選択のみ）
- キャンセル連携: `payment_status` はキャンセル可否判定（`orders.status = 'received'`）に関与させない。キャンセル時の自動更新も行わない

## 設計

### 1. DBスキーマ変更（`supabase/migrations/0008_payment.sql`）

`orders` テーブルに以下のカラムを追加する。

```sql
alter table orders
  add column payment_method text not null default 'card'
    check (payment_method in ('card', 'bank_transfer', 'cod')),
  add column payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid'));
```

- `card`（クレジットカード）・`bank_transfer`（銀行振込）: 注文確定と同時に決済が完了する想定のため `payment_status = 'paid'`
- `cod`（代金引換）: 商品受け取り時に支払うため `payment_status = 'pending'` のまま

既存注文（マイグレーション時点で存在する行）は default 値 `card` / `pending` が入るが、実データがまだ存在しない開発環境が前提のため互換性の考慮は不要とする。

### 2. `place_order()` RPC変更

`supabase/migrations/0009_place_order_payment.sql` で `place_order()` を `create or replace` し、引数に `p_payment_method text` を追加する。

```sql
create or replace function place_order(p_payment_method text)
returns uuid
...
begin
  if p_payment_method not in ('card', 'bank_transfer', 'cod') then
    raise exception '不正な支払い方法です';
  end if;
  ...
  insert into orders (user_id, status, total_cents, payment_method, payment_status)
  values (
    auth.uid(),
    'received',
    v_total,
    p_payment_method,
    case when p_payment_method = 'cod' then 'pending' else 'paid' end
  )
  returning id into v_order_id;
  ...
end;
$$;

grant execute on function place_order(text) to authenticated;
```

引数なしの旧シグネチャ `place_order()` は残さず置き換える（呼び出し元はチェックアウトルートのみのため互換シムは不要）。

### 3. チェックアウトUI

**[app/cart/page.tsx](../../../app/cart/page.tsx)**: 「注文する」フォームに支払い方法のラジオボタンを追加する。

```tsx
<form action="/cart/checkout" method="post">
  <fieldset>
    <legend>支払い方法</legend>
    <label><input type="radio" name="payment_method" value="card" defaultChecked /> クレジットカード</label>
    <label><input type="radio" name="payment_method" value="bank_transfer" /> 銀行振込</label>
    <label><input type="radio" name="payment_method" value="cod" /> 代金引換</label>
  </fieldset>
  <button type="submit">注文する</button>
</form>
```

**[app/cart/checkout/route.ts](../../../app/cart/checkout/route.ts)**: `request.formData()` から `payment_method` を取得し、RPCへ渡す。値が3択以外の場合はカートページへエラーリダイレクト（RPC側のcheck制約でも防御されるが、UI層でも早期に弾く）。

### 4. 注文詳細・一覧への反映

**[app/orders/[id]/page.tsx](../../../app/orders/[id]/page.tsx)** および一覧ページに、支払い方法・支払いステータスを日本語ラベルに変換して表示する。

```ts
const paymentMethodLabel = { card: 'クレジットカード', bank_transfer: '銀行振込', cod: '代金引換' }[order.payment_method]
const paymentStatusLabel = { pending: '支払い待ち', paid: '支払い済み' }[order.payment_status]
```

### 5. キャンセルへの影響

`cancel_order()` RPC（`supabase/migrations/0007_cancel_order.sql`）は変更しない。キャンセル可否は引き続き `status = 'received'` のみで判定し、`payment_status` は更新しない。

### 6. テスト

- `tests/concurrency/place_order.test.ts`: RPC呼び出しに `p_payment_method` を渡すよう更新
- `tests/rls/orders.test.ts`: 同上、RPC呼び出し箇所を更新
- 新規テスト（`tests/rpc/place_order_payment.test.ts` 等）: 支払い方法ごとに `payment_status` が正しく設定されること（card/bank_transfer → paid、cod → pending）を検証
- 不正な `payment_method` を渡した場合にRPCがエラーを返すことを検証

## スコープ外

- 実際の決済代行（Stripe等）との連携
- 決済失敗のシミュレーション
- 返金・キャンセル時のpayment_status自動更新
- クレジットカード番号等の入力フォーム・バリデーション
