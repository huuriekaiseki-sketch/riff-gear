-- supabase/migrations/0018_membership.sql
-- WHY: 有料会員(プレミアム会員)ランク導入の第一段階。profiles.membershipで会員種別を持たせ、
-- products.premium_onlyで会員限定商品かどうかを表現する。既存のis_admin()(0002_rls.sql)を
-- 参考パターンとして踏襲しつつ、is_premium()はauth.jwt() app_metadataではなく
-- profilesテーブルのmembership列を参照して判定する。

alter table profiles add column membership text not null default 'free'
  check (membership in ('free', 'premium'));

alter table products add column premium_only boolean not null default false;

-- WHY: is_premium()をinvoker権限のままにすると、products_select_allポリシー内で
-- OR条件(not premium_only or is_premium() or is_admin())の評価順序が保証されないため
-- (PostgreSQLの仕様上、左から右への短絡評価は保証されない)、premium_only=falseの行に
-- 対してもis_premium()が先に評価されうる。anonロールにはprofilesへのSELECT権限が
-- 付与されていない(0006_grants.sql)ため、その場合「permission denied for relation
-- profiles」でクエリ全体が失敗しうる。これを避けるため、is_premium()は
-- security definerにしてprofiles参照を関数実行者の権限から切り離す。
create or replace function is_premium() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select membership from profiles where id = auth.uid()) = 'premium',
    false
  );
$$;

grant execute on function is_premium() to anon, authenticated, service_role;

-- WHY: premium_only=trueの商品は、非会員(is_premium()がfalse)および未ログインユーザーからは
-- selectできないようにする。管理者は従来通りis_admin()で閲覧できる。
-- 既存のproducts_select_allポリシーを差し替える形で更新する。
drop policy if exists "products_select_all" on products;

create policy "products_select_all" on products
  for select using (
    not premium_only or is_premium() or is_admin()
  );
