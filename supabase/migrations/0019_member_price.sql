-- supabase/migrations/0019_member_price.sql
-- WHY: 有料会員(premium会員)向けの会員価格表示機能。products.member_price_censtsは
-- 通常価格(price_cents)より安い金額のみを許容したいため、check制約でprice_cents未満
-- であることを保証する。nullableにするのは、全商品に会員価格を設定する運用ではなく、
-- 一部商品のみ会員価格を持たせたいため(nullは「会員価格設定なし」を表す)。
-- 決済ロジック(place_order RPC等)への反映は別スコープであり、本マイグレーションでは
-- 表示用の列追加のみを行う。

alter table products add column member_price_cents integer
  check (member_price_cents is null or member_price_cents < price_cents);

-- ROLLBACK:
-- alter table products drop column member_price_cents;
