-- supabase/migrations/0023_sales_dashboard.sql
-- WHY: 管理画面の売上ダッシュボード(issue #82)のため、日別売上・商品別売上を集計する
-- RPCが必要になる。order_items/ordersはRLSで本人/管理者のみselect可能に制限されており、
-- 管理者が全ユーザーの注文を横断集計するにはRLSをバイパスするsecurity definer関数が要る。
-- ただし0021のget_product_sales_counts()(商品ID・数量のみで個人情報を含まない公開集計)
-- とは異なり、今回は金額という機微度の高い集計を返すため、関数内でis_admin()チェックを行い
-- 非管理者からの呼び出しはexceptionで拒否する(security definer関数の権限バイパスに対する
-- 唯一の防御線になるため必須)。「売上」の定義はstatus <> 'cancelled'のorders全件とし、
-- payment_statusは問わない(0021と同じ思想)。

-- 直近days日分の日別売上・注文数を返す。
create or replace function get_daily_sales(days integer)
returns table (sales_date date, total_cents bigint, order_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'permission denied: admin only';
  end if;

  return query
  select
    o.created_at::date as sales_date,
    sum(o.total_cents)::bigint as total_cents,
    count(*)::bigint as order_count
  from orders o
  where o.status <> 'cancelled'
    and o.created_at >= (now() - (days || ' days')::interval)
  group by o.created_at::date
  order by o.created_at::date;
end;
$$;

grant execute on function get_daily_sales(integer) to authenticated;

-- 商品別の販売数・売上金額を返す(売上金額降順は呼び出し側/RPC内どちらでも良いが、
-- 集計RPCとしての再利用性を考えてここではproduct_idごとの集計のみ行い、並び替えは
-- order byで確定させておく)。
create or replace function get_product_sales_summary()
returns table (
  product_id uuid,
  product_name text,
  sales_count bigint,
  total_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'permission denied: admin only';
  end if;

  return query
  select
    oi.product_id,
    p.name as product_name,
    sum(oi.quantity)::bigint as sales_count,
    sum(oi.quantity * oi.price_cents_at_order)::bigint as total_cents
  from order_items oi
  join orders o on o.id = oi.order_id
  join products p on p.id = oi.product_id
  where o.status <> 'cancelled'
  group by oi.product_id, p.name
  order by total_cents desc;
end;
$$;

grant execute on function get_product_sales_summary() to authenticated;

-- ROLLBACK:
-- drop function if exists get_daily_sales(integer);
-- drop function if exists get_product_sales_summary();
