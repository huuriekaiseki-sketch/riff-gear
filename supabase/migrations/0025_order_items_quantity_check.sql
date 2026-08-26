-- supabase/migrations/0025_order_items_quantity_check.sql
-- WHY: cart_items.quantityにはcheck (quantity > 0)があるが、order_itemsには無かった。
-- place_order()は常にcart_itemsから注文明細を作るため実害は出ていないが、
-- 管理画面やバッチ等アプリを経由しない書き込み経路ができた場合に0以下の数量を防げない。
alter table order_items
  add constraint order_items_quantity_positive check (quantity > 0);

-- ROLLBACK:
-- alter table order_items drop constraint order_items_quantity_positive;
