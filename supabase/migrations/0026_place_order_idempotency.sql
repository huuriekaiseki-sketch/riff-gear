-- supabase/migrations/0026_place_order_idempotency.sql
-- WHY: 二重クリック・リトライによる二重注文を防ぐため、place_order()にオプションの
-- 冪等キー引数を追加する。省略時(null)は従来通りの挙動で後方互換。
-- 同一ユーザー+同一キーでの2回目以降の呼び出しは、新規作成せず既存注文のIDをそのまま返す。
-- 同時に同じキーで呼ばれた場合はpg_advisory_xact_lockで直列化し、
-- 後から実行された方が「既存注文あり」を必ず検知できるようにする(先勝ちで在庫を二重に減らさない)。
alter table orders add column idempotency_key text;
alter table orders add constraint orders_user_idempotency_key_unique unique (user_id, idempotency_key);

drop function if exists place_order(text, text);

create or replace function place_order(p_payment_method text, p_coupon_code text default null, p_idempotency_key text default null)
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
  v_discount_percent integer;
  r record;
begin
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || p_idempotency_key));

    select id into v_order_id from orders
    where user_id = auth.uid() and idempotency_key = p_idempotency_key;
    if v_order_id is not null then
      return v_order_id;
    end if;
  end if;

  if p_payment_method not in ('card', 'bank_transfer', 'cod', 'convenience_store', 'qr_code') then
    raise exception '不正な支払い方法です: %', p_payment_method;
  end if;

  v_payment_status := case
    when p_payment_method in ('card', 'qr_code') then 'paid'
    else 'pending'
  end;

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

  if p_coupon_code is not null then
    select discount_percent into v_discount_percent
    from coupons
    where code = p_coupon_code
      and active
      and (expires_at is null or expires_at > now());

    if v_discount_percent is null then
      raise exception '無効なクーポンコードです: %', p_coupon_code;
    end if;

    v_total := v_total - (v_total * v_discount_percent / 100);
  end if;

  insert into orders (user_id, status, total_cents, payment_method, payment_status, idempotency_key)
  values (auth.uid(), 'received', v_total, p_payment_method, v_payment_status, p_idempotency_key)
  returning id into v_order_id;

  insert into order_items (order_id, product_id, quantity, price_cents_at_order)
  select v_order_id, ci.product_id, ci.quantity, p.price_cents
  from cart_items ci join products p on p.id = ci.product_id
  where ci.cart_id = v_cart_id;

  delete from cart_items where cart_id = v_cart_id;

  return v_order_id;
end;
$$;

grant execute on function place_order(text, text, text) to authenticated;

-- ROLLBACK:
-- drop function if exists place_order(text, text, text);
--
-- create or replace function place_order(p_payment_method text, p_coupon_code text default null)
-- returns uuid
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_cart_id uuid;
--   v_order_id uuid;
--   v_total integer := 0;
--   v_payment_status text;
--   v_discount_percent integer;
--   r record;
-- begin
--   if p_payment_method not in ('card', 'bank_transfer', 'cod', 'convenience_store', 'qr_code') then
--     raise exception '不正な支払い方法です: %', p_payment_method;
--   end if;
--
--   v_payment_status := case
--     when p_payment_method in ('card', 'qr_code') then 'paid'
--     else 'pending'
--   end;
--
--   select id into v_cart_id from carts where user_id = auth.uid();
--   if v_cart_id is null then
--     raise exception 'カートが存在しません';
--   end if;
--
--   for r in
--     select ci.product_id, ci.quantity, p.price_cents, p.stock
--     from cart_items ci
--     join products p on p.id = ci.product_id
--     where ci.cart_id = v_cart_id
--     order by ci.product_id
--     for update of p
--   loop
--     if r.stock < r.quantity then
--       raise exception '在庫不足: product_id=%', r.product_id;
--     end if;
--
--     update products set stock = stock - r.quantity where id = r.product_id;
--     v_total := v_total + r.price_cents * r.quantity;
--   end loop;
--
--   if v_total = 0 then
--     raise exception 'カートが空です';
--   end if;
--
--   if p_coupon_code is not null then
--     select discount_percent into v_discount_percent
--     from coupons
--     where code = p_coupon_code
--       and active
--       and (expires_at is null or expires_at > now());
--
--     if v_discount_percent is null then
--       raise exception '無効なクーポンコードです: %', p_coupon_code;
--     end if;
--
--     v_total := v_total - (v_total * v_discount_percent / 100);
--   end if;
--
--   insert into orders (user_id, status, total_cents, payment_method, payment_status)
--   values (auth.uid(), 'received', v_total, p_payment_method, v_payment_status)
--   returning id into v_order_id;
--
--   insert into order_items (order_id, product_id, quantity, price_cents_at_order)
--   select v_order_id, ci.product_id, ci.quantity, p.price_cents
--   from cart_items ci join products p on p.id = ci.product_id
--   where ci.cart_id = v_cart_id;
--
--   delete from cart_items where cart_id = v_cart_id;
--
--   return v_order_id;
-- end;
-- $$;
--
-- grant execute on function place_order(text, text) to authenticated;
--
-- alter table orders drop constraint orders_user_idempotency_key_unique;
-- alter table orders drop column idempotency_key;
