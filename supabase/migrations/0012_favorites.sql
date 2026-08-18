-- supabase/migrations/0012_favorites.sql
-- お気に入り機能。ユーザーごとに商品をハート登録できるようにする。
-- 「同じ商品を二重にお気に入り登録できない」ことをDB制約(unique)で保証する。

create table favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table favorites enable row level security;

create policy "favorites_select_own_or_admin" on favorites
  for select using (user_id = auth.uid() or is_admin());

create policy "favorites_write_own" on favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on favorites to authenticated, service_role;
