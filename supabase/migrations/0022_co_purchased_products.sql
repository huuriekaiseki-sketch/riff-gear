-- supabase/migrations/0022_co_purchased_products.sql
-- WHY: 商品詳細ページに「一緒に購入されている商品」レコメンドを表示するため、
-- 対象商品を含む注文と同一の注文に含まれる他商品を集計する必要がある。
-- order_itemsはRLSで本人/管理者のみselect可能に制限されているため、全ユーザーの
-- 同時購入傾向を横断集計するには集計専用のsecurity definer関数が必要になる。
-- この関数が返すのは商品IDと共起回数（注文数ベース）のみで、注文者や金額などの
-- 個人情報を一切含まないため、RLSをバイパスして誰でも実行できる形にしても問題ない。
create or replace function get_co_purchased_products(target_product_id uuid)
returns table (product_id uuid, co_purchase_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select oi_other.product_id, count(distinct oi_other.order_id)::bigint as co_purchase_count
  from order_items oi_target
  join orders o on o.id = oi_target.order_id
  join order_items oi_other
    on oi_other.order_id = oi_target.order_id
    and oi_other.product_id <> oi_target.product_id
  where oi_target.product_id = target_product_id
    and o.status <> 'cancelled'
  group by oi_other.product_id
  order by co_purchase_count desc, oi_other.product_id;
$$;

grant execute on function get_co_purchased_products(uuid) to anon, authenticated, service_role;

-- ROLLBACK:
-- drop function if exists get_co_purchased_products(uuid);
