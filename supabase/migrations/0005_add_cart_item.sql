-- supabase/migrations/0005_add_cart_item.sql
-- カートへの商品追加をアトミックに行うための関数。
-- 既存の実装は SELECT で既存明細の有無を確認してから UPDATE/INSERT する
-- read-then-write 方式のため、同一ユーザーが同じ商品を短時間に連続で
-- 「カートに追加」した場合、数量の取りこぼしが起こり得る。
-- INSERT ... ON CONFLICT ... DO UPDATE はDB側で単一ステートメントとして
-- アトミックに処理されるため、この競合が解消される。
-- security definer にはしない。呼び出し元は RLS が効いた状態で
-- cart_id が自分のものであることを別途チェックされる想定。
create or replace function add_cart_item(p_cart_id uuid, p_product_id uuid, p_quantity integer)
returns void
language sql
as $$
  insert into cart_items (cart_id, product_id, quantity)
  values (p_cart_id, p_product_id, p_quantity)
  on conflict (cart_id, product_id)
  do update set quantity = cart_items.quantity + excluded.quantity
$$;

grant execute on function add_cart_item(uuid, uuid, integer) to authenticated;
