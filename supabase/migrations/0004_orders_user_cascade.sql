-- supabase/migrations/0004_orders_user_cascade.sql
-- orders.user_id の外部キー制約に on delete cascade を付与する。
-- 元の制約は on delete no action（デフォルト）のため、将来 auth.users からユーザーを
-- 削除する機能を追加した際、注文履歴が残るユーザーの削除がFK違反で失敗してしまう。
-- 実際の制約名は information_schema / pg_constraint で事前に確認した
-- 「orders_user_id_fkey」を使用する。

alter table orders drop constraint orders_user_id_fkey;

alter table orders
  add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
