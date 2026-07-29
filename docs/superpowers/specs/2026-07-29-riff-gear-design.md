# Riff Gear 設計書

## 目的

架空EC「Riff Gear」（ギター・キーボードなどバンド機材のオンラインショップ）を題材に、認証・RLS・DB設計判断を「ゼロから書いて検証する」練習を行う。7/22のセッションで自分自身が指摘したギャップ（RLSを書くだけで、実際に他人IDでアクセスして弾かれるかを検証していなかった点）を埋めることが主眼。

## スコープ

会員登録（Magic Link）→商品一覧→カート→注文→注文履歴、および管理者による全注文管理。
決済・OCR応用・音楽/動画生成への横展開は本セッションのスコープ外（別セッションで扱う）。

## 技術スタック

- Next.js（App Router）+ TypeScript
- Supabase（Auth / Postgres / RLS）
- Vitest（RLS自動検証テスト）
- スタイリング：Awesome Design Skills から後日スタイルを選定して適用（本設計書では見た目は未確定）
- デプロイ：スコープ外。ローカル開発 + クラウドのSupabaseプロジェクトに接続。Supabaseプロジェクトは未作成、これから作成する。

## 認証・ロール設計

- 認証: Supabase Auth の Magic Link（パスワードレス）
- ロール（`customer` / `admin`）は **`auth.users.raw_app_meta_data`（app_metadata）** に格納する。
  - `user_metadata` はユーザー自身が `supabase.auth.updateUser()` で書き換え可能なため、権限昇格に使われうる。これを避けるため `app_metadata` を採用し、初期管理者付与は Supabase Admin API（service role）経由のスクリプトで行う。
- 管理者判定は共通SQLヘルパー関数 `is_admin()` で行い、各RLSポリシーから参照する。

```sql
create or replace function is_admin() returns boolean as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$ language sql stable;
```

## DBスキーマ

```
profiles
  id            uuid PK, references auth.users(id)
  display_name  text
  created_at    timestamptz default now()

products
  id          uuid PK default gen_random_uuid()
  name        text not null
  category    text not null           -- 'guitar' | 'keyboard' | 'accessory' など
  price_cents integer not null check (price_cents >= 0)
  stock       integer not null check (stock >= 0)
  image_url   text
  created_at  timestamptz default now()

carts
  id          uuid PK default gen_random_uuid()
  user_id     uuid not null unique references auth.users(id)
  created_at  timestamptz default now()

cart_items
  id          uuid PK default gen_random_uuid()
  cart_id     uuid not null references carts(id) on delete cascade
  product_id  uuid not null references products(id)
  quantity    integer not null check (quantity > 0)
  unique(cart_id, product_id)

orders
  id          uuid PK default gen_random_uuid()
  user_id     uuid not null references auth.users(id)
  status      text not null default 'received'
              check (status in ('received','preparing','shipped','cancelled'))
  total_cents integer not null
  created_at  timestamptz default now()

order_items
  id                    uuid PK default gen_random_uuid()
  order_id              uuid not null references orders(id) on delete cascade
  product_id            uuid not null references products(id)
  quantity              integer not null
  price_cents_at_order  integer not null  -- 注文時点の単価スナップショット
```

注文ステータス対応: `received`=注文受付, `preparing`=発送準備, `shipped`=発送済み, `cancelled`=キャンセル。

## RLSポリシー設計

| テーブル | SELECT | 書き込み |
|---|---|---|
| `products` | 全員可（未ログインでも閲覧可） | `is_admin()` のみ |
| `carts` | `user_id = auth.uid()` または `is_admin()` | `user_id = auth.uid()` のみ |
| `cart_items` | 親カートが自分のもの or admin | 親カートが自分のものであることをEXISTSで確認 |
| `orders` | `user_id = auth.uid()` または `is_admin()` | INSERT禁止（`place_order` RPC経由のみ）。UPDATE(status)は `is_admin()` のみ |
| `order_items` | 親注文が自分のもの or admin | 直接書き込み禁止（RPC経由のみ） |
| `profiles` | 本人 or admin | 本人のみ |

`orders`/`order_items` への直接INSERTを禁止し、`place_order` RPCのみが書き込めるようにすることで、在庫チェックを迂回した注文作成を防ぐ。

## 注文処理（在庫の排他制御）

在庫減算と注文作成をPostgresの `place_order()` 関数（`security definer`、単一トランザクション）にまとめ、同時注文時の二重販売を防ぐ。

- カート内の商品行を `SELECT ... FOR UPDATE` で商品ID昇順にロック（ロック順序を揃えてデッドロックを回避）
- 各行で `在庫 >= 注文数量` を確認し、不足時は例外を投げてトランザクション全体をロールバック
- 在庫を減算し、`orders` / `order_items` を作成、`cart_items` を空にする
- `auth.uid()` は呼び出し元セッションのものが使われるため、他人になりすました注文は不可

比較検討した他案:
- アプリ層での逐次SELECT→INSERT: 実装は簡単だがレースコンディションが残るため不採用
- Serializable分離レベル + リトライ: 理論上は正しいが実装が複雑になり学習の焦点がぼやけるため不採用

## 画面構成

- `/` 商品一覧（未ログイン可、在庫0は売り切れ表示・カート追加不可）
- `/login` Magic Linkログイン
- `/cart` カート確認・数量変更・注文確定（`place_order` RPC呼び出し）
- `/orders` 自分の注文履歴（RLSで自分の分のみ取得されることの確認も兼ねる）
- `/admin/orders` 管理者用・全注文一覧+ステータス変更（admin以外はアクセス不可）

## RLS自動検証（Vitest）

- テストユーザー2人（userA, userB）をSupabase Admin API経由で事前作成
- userAのクライアントでuserBの `order_id` を直接SELECT/UPDATEしようとして、空配列またはエラーになることをアサート
- customerロールのuserAが `products` の更新や管理者向けRPCを試みて拒否されることをアサート
- 管理者ロール付与は `supabase.auth.admin.updateUserById()` でテストヘルパー化する

## 決済

実決済システムは本セッションのスコープ外。カート画面の「注文する」ボタン押下で `place_order` RPCを呼び、即時に注文確定とする。

## スコープ外

- 実決済（Stripe等）連携
- 本番デプロイ（Vercel等）
- OCRによる返却時数量照合（medical-inventoryへの応用は別セッション）
- 音楽・動画生成への横展開（別セッション）
