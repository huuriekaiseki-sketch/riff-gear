-- supabase/migrations/0010_profile_address_and_signup_trigger.sql

-- WHY: 注文Webhook通知に住所を含められるようにするため、profilesに配送先関連カラムを追加する。
alter table profiles
  add column postal_code text,
  add column address text,
  add column phone text;

-- WHY: これまでprofiles行を作るコード/トリガーが存在せず、サインアップしても
-- profilesが空のままだった。auth.users作成時に自動でprofiles行を作る。
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
