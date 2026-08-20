-- supabase/migrations/0017_coupons.sql
-- WHY: issue #51 クーポン・割引コード機能。クーポンコードは検証のため誰でもSELECT可能にする必要がある
-- (未ログインでもカート画面でコードの有効性を確認したいケースを想定)が、書き込みは管理者のみに限定する。
-- 使用回数制限は要件になく、有効期限(expires_at)とactiveフラグのみで制御する。

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_percent integer not null check (discount_percent > 0 and discount_percent <= 100),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table coupons enable row level security;

-- WHY: place_order()内のクーポン検証やチェックアウト画面でのコード確認のため、
-- 誰でも(anonでも)SELECT可能にする。書き込みはis_admin()のみ許可。
create policy "coupons_select_all" on coupons
  for select using (true);

create policy "coupons_write_admin_only" on coupons
  for all using (is_admin()) with check (is_admin());

-- WHY: 0006_grants.sqlのパターンに従い、テーブル本体へのGRANTを明示する。
-- RLSが最終的なアクセス制御を行うが、GRANT自体が無いとpermission deniedになる。
grant select on coupons to anon, authenticated, service_role;
grant insert, update, delete on coupons to authenticated, service_role;

-- place_order()を拡張し、p_coupon_code(nullable)を受け取れるようにする。
-- 有効なクーポンであればtotal_centsにdiscount_percent%の割引を適用する。
-- 無効/期限切れ/非activeなコードが指定された場合はエラーを投げて注文を中断する。
drop function if exists place_order(text);

create or replace function place_order(p_payment_method text, p_coupon_code text default null)
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

grant execute on function place_order(text, text) to authenticated;
