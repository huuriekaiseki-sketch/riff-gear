-- supabase/migrations/0013_reviews.sql
-- レビュー・評価機能。「購入したユーザーだけが投稿できる」信頼性の高いレビューにするため、
-- INSERTのRLSポリシーで「このユーザーがこの商品を含む、キャンセルされていない注文を
-- 持っているか」をEXISTSで検証する(=購入していない商品にはレビューを書けない)。
-- 1ユーザー1商品につき1レビュー(unique制約。再投稿は上書き=UPDATEを使う想定)。

create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table reviews enable row level security;

-- 星評価・平均点はどの商品でも社会的証明として機能するべきなので、
-- productsと同じく閲覧は誰でも可能にする(未ログインの閲覧者にも見せる)。
create policy "reviews_select_all" on reviews
  for select using (true);

create policy "reviews_insert_purchasers_only" on reviews
  for insert with check (
    user_id = auth.uid() and exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.product_id = reviews.product_id
        and o.user_id = auth.uid()
        and o.status <> 'cancelled'
    )
  );

create policy "reviews_update_own" on reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "reviews_delete_own" on reviews
  for delete using (user_id = auth.uid() or is_admin());

grant select on reviews to anon, authenticated, service_role;
grant insert, update, delete on reviews to authenticated, service_role;
