-- supabase/migrations/0006_grants.sql
-- WHY: これまでテーブル本体へのGRANTが一度も明示的に書かれておらず、本番Supabase側で
-- 個別に(手動/ダッシュボード経由で)権限が付与されていたため気づかれていなかった。
-- CI上でmigrationsだけからローカルSupabaseを再構築すると
-- 「permission denied for table ...」で全RLSテストが失敗することが判明したため、
-- RLSポリシーが許可する操作に対応するテーブル権限を明示的に付与する。
-- (最終的なアクセス制御はRLSポリシーが行うため、ここでのGRANTは「土台」を揃えるだけ)

grant usage on schema public to anon, authenticated, service_role;

grant select on profiles to authenticated, service_role;
grant insert, update on profiles to authenticated, service_role;
grant delete on profiles to service_role;

grant select on products to anon, authenticated, service_role;
grant insert, update, delete on products to authenticated, service_role;

grant select, insert, update, delete on carts to authenticated, service_role;

grant select, insert, update, delete on cart_items to authenticated, service_role;

grant select on orders to authenticated, service_role;
grant insert, update, delete on orders to service_role;
grant update on orders to authenticated;

grant select on order_items to authenticated, service_role;
grant insert, update, delete on order_items to service_role;
