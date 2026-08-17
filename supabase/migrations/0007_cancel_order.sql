-- supabase/migrations/0007_cancel_order.sql
create or replace function cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_user_id uuid;
begin
  select status, user_id into v_status, v_user_id
  from orders
  where id = p_order_id
  for update;

  if v_user_id is null then
    raise exception '注文が見つかりません';
  end if;

  if v_user_id <> auth.uid() then
    raise exception '自分の注文のみキャンセルできます';
  end if;

  if v_status <> 'received' then
    raise exception 'この注文はキャンセルできません（現在のステータス: %）', v_status;
  end if;

  update products p
  set stock = p.stock + oi.quantity
  from order_items oi
  where oi.order_id = p_order_id and oi.product_id = p.id;

  update orders set status = 'cancelled' where id = p_order_id;
end;
$$;

grant execute on function cancel_order(uuid) to authenticated;
