# ダミー決済機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** チェックアウト時に支払い方法（クレジットカード／銀行振込／代金引換）を選択できるようにし、注文に `payment_method` と `payment_status` を記録・表示する。決済は常に成功する前提で、実際の決済代行連携や失敗シミュレーションは行わない。

**Architecture:** `orders` テーブルに `payment_method` / `payment_status` カラムを追加し、`place_order()` RPCが支払い方法を受け取って注文作成と同時にステータスを決定する。チェックアウトUIから支払い方法をフォーム送信し、注文一覧・詳細ページで日本語ラベル表示する。

**Tech Stack:** Next.js 16 (App Router) / Supabase (Postgres + RLS + RPC) / vitest（Supabase RPC統合テスト）

**Spec:** [docs/superpowers/specs/2026-08-17-dummy-payment-design.md](../specs/2026-08-17-dummy-payment-design.md)

## Global Constraints

- 決済は常に成功する前提。失敗シミュレーションは実装しない
- 支払い方法は `card` / `bank_transfer` / `cod` の3値のみ
- `card` / `bank_transfer` は `payment_status = 'paid'`、`cod` は `payment_status = 'pending'`
- `cancel_order()` RPCとキャンセル可否判定（`status = 'received'`）は変更しない。`payment_status` はキャンセル時に自動更新しない
- 既存の `place_order()` の引数なし呼び出し（`rpc('place_order')`）は全て `p_payment_method` 付きに置き換える。旧シグネチャは残さない

---

## Task 1: DBスキーマ拡張とplace_order RPCの支払い方法対応

**Files:**
- Create: `supabase/migrations/0008_payment.sql`
- Create: `supabase/migrations/0009_place_order_payment.sql`
- Create: `tests/rpc/place_order_payment.test.ts`
- Modify: `tests/concurrency/place_order.test.ts:70-71`
- Modify: `tests/rls/orders.test.ts:37`
- Modify: `tests/rls/order-items.test.ts:37`
- Modify: `tests/rpc/cancel_order.test.ts:68`

**Interfaces:**
- Consumes: 既存の `orders` テーブル、既存の `place_order()` RPC（引数なし）
- Produces: `place_order(p_payment_method text) returns uuid` RPC。`orders.payment_method text`（`'card' | 'bank_transfer' | 'cod'`）、`orders.payment_status text`（`'pending' | 'paid'`）カラム。以降のタスクはこのRPCシグネチャとカラム名を使う

- [ ] **Step 1: 失敗するテストを書く**

`tests/rpc/place_order_payment.test.ts` を新規作成する。

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-users'
import { createAdminClient } from '@/lib/supabase/admin'

// place_order() の支払い方法(payment_method)引数と、それに応じたpayment_statusの初期値を検証する。
// card/bank_transferは即時決済完了想定でpaid、cod(代金引換)は受け取り時払いのためpendingになる。
describe('place_order の支払い方法とpayment_status', () => {
  let user: TestUser
  let productId: string

  beforeAll(async () => {
    user = await createTestUser('customer')

    const adminClient = createAdminClient()
    const { data: product, error } = await adminClient
      .from('products')
      .insert({
        name: '決済テスト用ダミー商品',
        category: 'accessory',
        price_cents: 1000,
        stock: 10,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    productId = product!.id
  })

  afterAll(async () => {
    const adminClient = createAdminClient()

    const { data: orders } = await adminClient.from('orders').select('id').eq('user_id', user.id)
    if (orders && orders.length > 0) {
      await adminClient
        .from('orders')
        .delete()
        .in('id', orders.map((o) => o.id))
    }
    await adminClient.from('cart_items').delete().eq('product_id', productId)
    await adminClient.from('products').delete().eq('id', productId)

    await deleteTestUser(user.id)
  })

  async function addItemToCart() {
    const { data: existingCart } = await user.client
      .from('carts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    const cart =
      existingCart ??
      (await user.client.from('carts').insert({ user_id: user.id }).select('id').single()).data
    await user.client.from('cart_items').insert({ cart_id: cart!.id, product_id: productId, quantity: 1 })
  }

  it.each([
    ['card', 'paid'],
    ['bank_transfer', 'paid'],
    ['cod', 'pending'],
  ])('payment_method=%s のときpayment_status=%sになる', async (method, expectedStatus) => {
    await addItemToCart()
    const { data: orderId, error } = await user.client.rpc('place_order', { p_payment_method: method })
    expect(error).toBeNull()

    const { data: order } = await createAdminClient()
      .from('orders')
      .select('payment_method, payment_status')
      .eq('id', orderId as string)
      .single()
    expect(order?.payment_method).toBe(method)
    expect(order?.payment_status).toBe(expectedStatus)
  })

  it('不正なpayment_methodはエラーになる', async () => {
    await addItemToCart()
    const { error } = await user.client.rpc('place_order', { p_payment_method: 'paypal' })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: テストを実行して失敗することを確認する**

Run: `npx vitest run tests/rpc/place_order_payment.test.ts`
Expected: FAIL（`place_order(p_payment_method)` という引数を受け取るRPCがまだ存在せず、`Could not find the function` 等のエラーになる）

- [ ] **Step 3: スキーマ拡張マイグレーションを作成する**

`supabase/migrations/0008_payment.sql` を新規作成する。

```sql
-- supabase/migrations/0008_payment.sql
alter table orders
  add column payment_method text not null default 'card'
    check (payment_method in ('card', 'bank_transfer', 'cod')),
  add column payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid'));
```

- [ ] **Step 4: place_order RPCを支払い方法対応に置き換えるマイグレーションを作成する**

`supabase/migrations/0009_place_order_payment.sql` を新規作成する。

`create or replace function` は引数の型が変わると別関数として追加されてしまう（既存の `place_order()` が残り続ける）ため、先に旧シグネチャを明示的に `drop` する。

```sql
-- supabase/migrations/0009_place_order_payment.sql
drop function if exists place_order();

create or replace function place_order(p_payment_method text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart_id uuid;
  v_order_id uuid;
  v_total integer := 0;
  v_payment_status text;
  r record;
begin
  if p_payment_method not in ('card', 'bank_transfer', 'cod') then
    raise exception '不正な支払い方法です: %', p_payment_method;
  end if;

  v_payment_status := case when p_payment_method = 'cod' then 'pending' else 'paid' end;

  select id into v_cart_id from carts where user_id = auth.uid();
  if v_cart_id is null then
    raise exception 'カートが存在しません';
  end if;

  for r in
    select ci.product_id, ci.quantity, p.price_cents, p.stock
    from cart_items ci
    join products p on p.id = ci.product_id
    where ci.cart_id = v_cart_id
    order by ci.product_id
    for update of p
  loop
    if r.stock < r.quantity then
      raise exception '在庫不足: product_id=%', r.product_id;
    end if;

    update products set stock = stock - r.quantity where id = r.product_id;
    v_total := v_total + r.price_cents * r.quantity;
  end loop;

  if v_total = 0 then
    raise exception 'カートが空です';
  end if;

  insert into orders (user_id, status, total_cents, payment_method, payment_status)
  values (auth.uid(), 'received', v_total, p_payment_method, v_payment_status)
  returning id into v_order_id;

  insert into order_items (order_id, product_id, quantity, price_cents_at_order)
  select v_order_id, ci.product_id, ci.quantity, p.price_cents
  from cart_items ci join products p on p.id = ci.product_id
  where ci.cart_id = v_cart_id;

  delete from cart_items where cart_id = v_cart_id;

  return v_order_id;
end;
$$;

grant execute on function place_order(text) to authenticated;
```

- [ ] **Step 5: ローカルSupabaseにマイグレーションを適用する**

Run: `supabase db reset`
Expected: マイグレーションが順番に適用され、エラーなく完了する

- [ ] **Step 6: テストを実行して成功することを確認する**

Run: `npx vitest run tests/rpc/place_order_payment.test.ts`
Expected: PASS

- [ ] **Step 7: 既存の呼び出し元テストを新シグネチャに更新する**

`place_order()` を引数なしで呼んでいる既存テストを全て更新する（旧シグネチャは `drop` 済みのため、更新しないと以下4ファイルが失敗する）。

`tests/concurrency/place_order.test.ts:70-71` を変更:

```typescript
    const [resultA, resultB] = await Promise.allSettled([
      userA.client.rpc('place_order', { p_payment_method: 'card' }),
      userB.client.rpc('place_order', { p_payment_method: 'card' }),
    ])
```

`tests/rls/orders.test.ts:37` を変更:

```typescript
    const { data: orderId, error } = await userA.client.rpc('place_order', { p_payment_method: 'card' })
```

`tests/rls/order-items.test.ts:37` を変更:

```typescript
    const { data: orderId, error } = await userA.client.rpc('place_order', { p_payment_method: 'card' })
```

`tests/rpc/cancel_order.test.ts:68` を変更:

```typescript
    const { data: orderId, error } = await user.client.rpc('place_order', { p_payment_method: 'card' })
```

- [ ] **Step 8: テストスイート全体を実行して全て成功することを確認する**

Run: `npm test`
Expected: PASS（全テストファイルが成功する）

- [ ] **Step 9: コミット**

```bash
git add supabase/migrations/0008_payment.sql supabase/migrations/0009_place_order_payment.sql tests/rpc/place_order_payment.test.ts tests/concurrency/place_order.test.ts tests/rls/orders.test.ts tests/rls/order-items.test.ts tests/rpc/cancel_order.test.ts
git commit -m "feat: place_order RPCに支払い方法とpayment_statusを追加"
```

---

## Task 2: チェックアウトUIに支払い方法選択を追加

**Files:**
- Modify: `app/cart/page.tsx`
- Modify: `app/cart/checkout/route.ts`

**Interfaces:**
- Consumes: Task 1で作った `place_order(p_payment_method text)` RPC。有効な値は `'card' | 'bank_transfer' | 'cod'`
- Produces: チェックアウトフォームの `payment_method` フィールド（ラジオボタン、`name="payment_method"`）

- [ ] **Step 1: カートページに支払い方法のラジオボタンを追加する**

`app/cart/page.tsx` の合計金額表示〜注文ボタンのブロック（41-87行目付近の `<div className="mt-6 flex items-center justify-between ...">` 全体）を以下に置き換える。

```tsx
      <div className="mt-6 rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm dark:border-gray-800">
        <p className="text-lg font-semibold text-foreground">合計: ¥{total.toLocaleString()}</p>
        <form action="/cart/checkout" method="post" className="mt-4">
          <fieldset>
            <legend className="text-sm font-medium text-foreground">支払い方法</legend>
            <div className="mt-2 flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
              <label className="flex items-center gap-2">
                <input type="radio" name="payment_method" value="card" defaultChecked />
                クレジットカード
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="payment_method" value="bank_transfer" />
                銀行振込
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="payment_method" value="cod" />
                代金引換
              </label>
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={!items?.length}
            className="mt-4 w-full rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            注文する
          </button>
        </form>
      </div>
```

- [ ] **Step 2: チェックアウトルートハンドラでpayment_methodを読み取ってRPCに渡す**

`app/cart/checkout/route.ts` を以下に置き換える。

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const PAYMENT_METHODS = ['card', 'bank_transfer', 'cod'] as const

// カートの内容を注文として確定するルートハンドラ。
// 未ログインならログインページへ、place_order失敗時はカートページへエラー付きでリダイレクトする。
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const formData = await request.formData()
  const paymentMethod = formData.get('payment_method')
  if (typeof paymentMethod !== 'string' || !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    const url = new URL('/cart', request.url)
    url.searchParams.set('error', '支払い方法を選択してください')
    return NextResponse.redirect(url)
  }

  const { data: orderId, error } = await supabase.rpc('place_order', {
    p_payment_method: paymentMethod,
  })
  if (error) {
    const url = new URL('/cart', request.url)
    url.searchParams.set('error', error.message)
    return NextResponse.redirect(url)
  }

  return NextResponse.redirect(new URL(`/orders/${orderId}`, request.url))
}
```

- [ ] **Step 3: 型チェックとビルドを実行する**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS（ビルドエラーなし）

- [ ] **Step 4: テストスイート全体を実行して全て成功することを確認する**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add app/cart/page.tsx app/cart/checkout/route.ts
git commit -m "feat: チェックアウトに支払い方法選択UIを追加"
```

---

## Task 3: 注文一覧・詳細ページに支払い方法とステータスを表示

**Files:**
- Modify: `app/orders/page.tsx`
- Modify: `app/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `orders.payment_method`（`'card' | 'bank_transfer' | 'cod'`）、`orders.payment_status`（`'pending' | 'paid'`）カラム（Task 1で追加済み）

- [ ] **Step 1: 注文一覧ページに支払い方法・ステータスを表示する**

`app/orders/page.tsx` を以下に置き換える。

```tsx
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 注文ステータスの表示用日本語ラベルとバッジ色
const STATUS_LABEL: Record<string, string> = {
  received: '注文受付',
  preparing: '発送準備',
  shipped: '発送済み',
  cancelled: 'キャンセル',
}
const STATUS_COLOR: Record<string, string> = {
  received: 'bg-secondary/10 text-secondary',
  preparing: 'bg-warning/10 text-warning',
  shipped: 'bg-success/10 text-success',
  cancelled: 'bg-danger/10 text-danger',
}

// 支払い方法・支払いステータスの表示用日本語ラベル
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: 'クレジットカード',
  bank_transfer: '銀行振込',
  cod: '代金引換',
}
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: '支払い待ち',
  paid: '支払い済み',
}

// 注文履歴ページ。RLSにより`orders`は本人の行しか返らないため、
// クエリ自体に user_id フィルタを書かなくてもユーザー間の分離が保たれる。
export default async function OrderHistoryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return <p className="text-gray-500 dark:text-gray-400">注文履歴を見るにはログインしてください。</p>
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, total_cents, created_at, payment_method, payment_status')
    .order('created_at', { ascending: false })

  if (error) {
    return <p role="alert">注文履歴の取得に失敗しました: {error.message}</p>
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">注文履歴</h1>
      <ul className="mt-6 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-surface shadow-sm dark:divide-gray-800 dark:border-gray-800">
        {orders?.map((order) => (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(order.created_at).toLocaleDateString('ja-JP')}
                </p>
                <p className="font-medium text-foreground">
                  ¥{order.total_cents.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method}
                  {' ・ '}
                  {PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-500'}`}
              >
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 2: 注文詳細ページに支払い方法・ステータスを表示する**

`app/orders/[id]/page.tsx` の冒頭のラベル定義部分（10-22行目）を以下に置き換える。

```tsx
// 注文ステータスの表示用日本語ラベルとバッジ色
const STATUS_LABEL: Record<string, string> = {
  received: '注文受付',
  preparing: '発送準備',
  shipped: '発送済み',
  cancelled: 'キャンセル',
}
const STATUS_COLOR: Record<string, string> = {
  received: 'bg-secondary/10 text-secondary',
  preparing: 'bg-warning/10 text-warning',
  shipped: 'bg-success/10 text-success',
  cancelled: 'bg-danger/10 text-danger',
}

// 支払い方法・支払いステータスの表示用日本語ラベル
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: 'クレジットカード',
  bank_transfer: '銀行振込',
  cod: '代金引換',
}
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: '支払い待ち',
  paid: '支払い済み',
}
```

同ファイルの `orders` の `select` 呼び出し（39行目）を以下に変更する。

```tsx
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, total_cents, created_at, payment_method, payment_status')
    .eq('id', id)
    .single()
```

同ファイルの合計金額表示ブロック（81-85行目）の直後に、支払い情報の表示を追加する。

```tsx
      <div className="mt-6 rounded-2xl border border-gray-200 bg-surface p-6 text-right shadow-sm dark:border-gray-800">
        <p className="text-lg font-semibold text-foreground">
          合計: ¥{order.total_cents.toLocaleString()}
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method}
          {' ・ '}
          {PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status}
        </p>
      </div>
```

- [ ] **Step 3: 型チェックとビルドを実行する**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: テストスイート全体を実行して全て成功することを確認する**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add app/orders/page.tsx "app/orders/[id]/page.tsx"
git commit -m "feat: 注文一覧・詳細ページに支払い方法とステータスを表示"
```
