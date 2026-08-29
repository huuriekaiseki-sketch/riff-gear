-- supabase/migrations/0029_coupon_admin_rpc.sql
-- WHY: 管理者向けクーポン管理画面から呼び出すRPCを追加する。既存のcoupons_write_admin_only
-- ポリシー(is_admin()のみ書込可)がすでにテーブルを保護しているため、security definerで
-- RLSをバイパスする必要はない。security invokerのまま関数内でもis_admin()を早期チェックし、
-- 「関数内チェック」と「RLS」の二重防御にする(known-failure-patterns.mdのsecurity definer
-- バイパス事例を踏まえ、あえてdefinerを避ける設計)。

create or replace function create_coupon(
  p_code text,
  p_discount_percent integer,
  p_expires_at timestamptz default null,
  p_usage_limit integer default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception '管理者のみクーポンを作成できます';
  end if;

  -- WHY: テーブルのcheck制約でも discount_percent > 0 and <= 100 を強制しているが、
  -- 呼び出し側にわかりやすいエラーメッセージを返すため関数内でも早期にvalidateする。
  if p_discount_percent is null or p_discount_percent < 1 or p_discount_percent > 100 then
    raise exception '割引率は1から100の範囲で指定してください: %', p_discount_percent;
  end if;

  if p_usage_limit is not null and p_usage_limit <= 0 then
    raise exception '利用回数上限は1以上を指定してください: %', p_usage_limit;
  end if;

  begin
    insert into coupons (code, discount_percent, expires_at, usage_limit)
    values (p_code, p_discount_percent, p_expires_at, p_usage_limit)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'クーポンコードが既に存在します: %', p_code;
  end;

  return v_id;
end;
$$;

grant execute on function create_coupon(text, integer, timestamptz, integer) to authenticated;

-- WHY: 冪等な無効化。既にactive=falseの行を対象にしても何もせず正常終了させる
-- (二重クリック・再送を考慮)。再有効化する経路はあえて提供しない設計要件のため、
-- activeをtrueに戻すUPDATE/RPCはここでは作らない。
create or replace function deactivate_coupon(p_coupon_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception '管理者のみクーポンを無効化できます';
  end if;

  update coupons set active = false where id = p_coupon_id and active = true;
end;
$$;

grant execute on function deactivate_coupon(uuid) to authenticated;

-- ROLLBACK:
-- drop function if exists create_coupon(text, integer, timestamptz, integer);
-- drop function if exists deactivate_coupon(uuid);
