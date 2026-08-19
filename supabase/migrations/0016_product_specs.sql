-- supabase/migrations/0015_product_specs.sql
-- 商品比較機能(issue #18)用。商品ごとに異なる仕様項目(ピックアップ・重量など)を
-- 持たせたいが、カテゴリごとに項目自体が違うため固定列ではなくJSONBで持たせる。

alter table products add column specs jsonb not null default '{}'::jsonb;
