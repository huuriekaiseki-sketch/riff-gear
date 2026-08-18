-- supabase/migrations/0011_payment_methods_expansion.sql

-- WHY: 支払い方法を「コンビニ支払い」「QRコード決済」に拡大し、
-- 支払い確定タイミングをより実態に近づける(即時決済=カード/QRコード、
-- 後日入金確認が必要=銀行振込/代金引換/コンビニ支払い)。
-- 従来は銀行振込も即時paidになっていたが、実際は入金確認が必要なためpendingに修正する。

alter table orders drop constraint orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('card', 'bank_transfer', 'cod', 'convenience_store', 'qr_code'));

drop function if exists place_order(text);

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
