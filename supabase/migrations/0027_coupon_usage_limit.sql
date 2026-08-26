-- supabase/migrations/0027_coupon_usage_limit.sql
-- WHY: クーポンに任意の利用回数上限を設定できるようにする。usage_limitがnullなら
-- 従来通り無制限(既存クーポンは影響を受けない後方互換)。上限があるクーポンは
-- 複数ユーザーが同時に使い切ろうとする競合(Write Skew)が起きうるため、
-- 検証時にfor updateでクーポン行をロックし直列化する(在庫チェックのfor update of pと同じ考え方)。
--
-- 既知の制約: 注文がキャンセルされてもused_countは減らさない(orders側にどのクーポンを
-- 使ったかを記録する列が無いため)。利用回数の返却が必要になった場合は別途対応する。
alter table coupons add column usage_limit integer check (usage_limit > 0);
alter table coupons add column used_count integer not null default 0 check (used_count >= 0);

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
  v_usage_limit integer;
  v_used_count integer;
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
    select discount_percent, usage_limit, used_count into v_discount_percent, v_usage_limit, v_used_count
    from coupons
    where code = p_coupon_code
      and active
      and (expires_at is null or expires_at > now())
    for update;

    if v_discount_percent is null then
      raise exception '無効なクーポンコードです: %', p_coupon_code;
    end if;

    if v_usage_limit is not null and v_used_count >= v_usage_limit then
      raise exception 'クーポンの利用上限に達しています: %', p_coupon_code;
    end if;

    v_total := v_total - (v_total * v_discount_percent / 100);

    update coupons set used_count = used_count + 1 where code = p_coupon_code;
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

-- ROLLBACK:
-- create or replace function place_order(p_payment_method text, p_coupon_code text default null, p_idempotency_key text default null)
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
--   if p_idempotency_key is not null then
--     perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || p_idempotency_key));
--     select id into v_order_id from orders where user_id = auth.uid() and idempotency_key = p_idempotency_key;
--     if v_order_id is not null then
--       return v_order_id;
--     end if;
--   end if;
--
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
--     where code = p_coupon_code and active and (expires_at is null or expires_at > now());
--     if v_discount_percent is null then
--       raise exception '無効なクーポンコードです: %', p_coupon_code;
--     end if;
--     v_total := v_total - (v_total * v_discount_percent / 100);
--   end if;
--
--   insert into orders (user_id, status, total_cents, payment_method, payment_status, idempotency_key)
--   values (auth.uid(), 'received', v_total, p_payment_method, v_payment_status, p_idempotency_key)
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
-- alter table coupons drop column used_count;
-- alter table coupons drop column usage_limit;
