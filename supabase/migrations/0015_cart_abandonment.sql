-- supabase/migrations/0015_cart_abandonment.sql
-- カート放棄リマインド機能のため、放棄通知済みかどうかをカート単位で記録する。
-- 一度通知したカートを何度も通知しないためのフラグであり、
-- 通知ロジック自体は管理画面表示時の遅延チェック（app/admin/orders/page.tsx）が担う。
alter table carts
  add column abandoned_notified_at timestamptz;

create policy "carts_update_admin" on carts
  for update using (is_admin()) with check (is_admin());
