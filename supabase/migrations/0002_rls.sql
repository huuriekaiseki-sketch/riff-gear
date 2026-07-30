-- supabase/migrations/0002_rls.sql
create or replace function is_admin() returns boolean as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$ language sql stable;

-- profiles
alter table profiles enable row level security;

create policy "profiles_select_own_or_admin" on profiles
  for select using (id = auth.uid() or is_admin());

create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());

create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid());

-- products
alter table products enable row level security;

create policy "products_select_all" on products
  for select using (true);

create policy "products_write_admin_only" on products
  for all using (is_admin()) with check (is_admin());

-- carts
alter table carts enable row level security;

create policy "carts_select_own_or_admin" on carts
  for select using (user_id = auth.uid() or is_admin());

create policy "carts_write_own" on carts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- cart_items
alter table cart_items enable row level security;

create policy "cart_items_select_own_or_admin" on cart_items
  for select using (
    is_admin() or exists (
      select 1 from carts c where c.id = cart_items.cart_id and c.user_id = auth.uid()
    )
  );

create policy "cart_items_write_own" on cart_items
  for all using (
    exists (select 1 from carts c where c.id = cart_items.cart_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from carts c where c.id = cart_items.cart_id and c.user_id = auth.uid())
  );

-- orders (no insert policy: only place_order() RPC, via security definer, may insert)
alter table orders enable row level security;

create policy "orders_select_own_or_admin" on orders
  for select using (user_id = auth.uid() or is_admin());

create policy "orders_update_admin_only" on orders
  for update using (is_admin()) with check (is_admin());

-- order_items (no insert policy: only place_order() RPC may insert)
alter table order_items enable row level security;

create policy "order_items_select_own_or_admin" on order_items
  for select using (
    is_admin() or exists (
      select 1 from orders o where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );
