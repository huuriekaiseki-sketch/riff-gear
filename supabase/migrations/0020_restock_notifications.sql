-- supabase/migrations/0020_restock_notifications.sql
-- 在庫切れ商品の再入荷通知機能(Issue #74)。通知手段は画面内通知のみ、検知はDBトリガー。
-- restock_subscriptions: 「この商品が再入荷したら知らせてほしい」というユーザーの購読を保持する。
-- 同じユーザーが同じ商品を二重購読できないようにunique制約で保証する(favoritesと同じ設計)。
create table restock_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table restock_subscriptions enable row level security;

create policy "restock_subscriptions_select_own_or_admin" on restock_subscriptions
  for select using (user_id = auth.uid() or is_admin());

create policy "restock_subscriptions_write_own" on restock_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on restock_subscriptions to authenticated, service_role;

-- restock_notifications: 実際に発生した「再入荷しました」の通知そのもの。
-- product_nameは商品が後で削除・改名されても通知文言を表示し続けられるようにスナップショットで持つ。
-- insert/deleteはトリガー関数(security definer)からのみ行わせたいため、
-- authenticatedへはinsert/deleteポリシーを一切作らない(ポリシー無し=許可なし)。
-- 既読化のためのupdateのみ本人に許可する。
create table restock_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  product_name text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

alter table restock_notifications enable row level security;

create policy "restock_notifications_select_own_or_admin" on restock_notifications
  for select using (user_id = auth.uid() or is_admin());

create policy "restock_notifications_update_own" on restock_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, update on restock_notifications to authenticated;
grant all on restock_notifications to service_role;

-- notify_restock_subscribers: productsのstockが0から1以上に変化した瞬間に、
-- その商品を購読している全ユーザーへ通知レコードを作成し、購読はワンショットで消費(delete)する。
-- security definer + search_path固定により、呼び出し元がauthenticated(RLSではrestock_notifications
-- へのinsert権限を持たない)であっても、トリガー内では確実に通知を書き込めるようにする。
create or replace function notify_restock_subscribers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.stock = 0 and new.stock > 0 then
    insert into restock_notifications (user_id, product_id, product_name)
    select rs.user_id, rs.product_id, new.name
    from restock_subscriptions rs
    where rs.product_id = new.id;

    delete from restock_subscriptions where product_id = new.id;
  end if;

  return new;
end;
$$;

create trigger trg_notify_restock_subscribers
  after update of stock on products
  for each row
  execute function notify_restock_subscribers();

-- ROLLBACK:
-- drop trigger if exists trg_notify_restock_subscribers on products;
-- drop function if exists notify_restock_subscribers();
-- drop table if exists restock_notifications;
-- drop table if exists restock_subscriptions;
