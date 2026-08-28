-- supabase/migrations/0028_order_amount_constraints.sql
-- WHY: order_items.price_cents_at_order/orders.total_centsに非負制約が無く、
-- order_itemsには同一注文内での商品重複を防ぐ制約も無かった。place_order()は
-- 常にproducts.price_centsをそのまま複製し、cart_itemsのunique(cart_id, product_id)
-- により重複も実害は出ていないが、管理画面やバッチ等アプリを経由しない書き込み経路が
-- できた場合に不正な金額・重複明細を防げない。
alter table order_items
  add constraint order_items_price_non_negative check (price_cents_at_order >= 0);

alter table order_items
  add constraint order_items_order_product_unique unique (order_id, product_id);

alter table orders
  add constraint orders_total_non_negative check (total_cents >= 0);

-- ROLLBACK:
-- alter table orders drop constraint orders_total_non_negative;
-- alter table order_items drop constraint order_items_order_product_unique;
-- alter table order_items drop constraint order_items_price_non_negative;
