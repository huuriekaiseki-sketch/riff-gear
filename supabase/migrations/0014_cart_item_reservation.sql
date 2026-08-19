-- supabase/migrations/0014_cart_item_reservation.sql
-- 在庫確保カウントダウン機能のため、カート明細の追加日時を記録する。
-- add_cart_item は ON CONFLICT DO UPDATE で quantity のみ更新するため、
-- 数量変更では created_at は更新されず、初回追加時刻が確保開始時刻になる。
alter table cart_items
  add column created_at timestamptz not null default now();
