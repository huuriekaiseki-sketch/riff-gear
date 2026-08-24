-- supabase/migrations/0021_product_sales_counts.sql
-- WHY: 商品一覧の「人気順」並び替えのため、商品ごとの累計販売数を集計する必要がある。
-- order_itemsはRLSで本人/管理者のみselect可能に制限されているため、一般ユーザー・anon
-- が人気順を閲覧できるようにするには集計専用のsecurity definer関数が必要になる。
-- この関数が返すのは商品IDと販売数量の合計のみで、注文者や金額などの個人情報を一切
-- 含まないため、RLSをバイパスして誰でも実行できる形にしても問題ない。
create or replace function get_product_sales_counts()
returns table (product_id uuid, sales_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select oi.product_id, sum(oi.quantity)::bigint as sales_count
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'cancelled'
  group by oi.product_id;
$$;

grant execute on function get_product_sales_counts() to anon, authenticated, service_role;

-- ROLLBACK:
-- drop function if exists get_product_sales_counts();
