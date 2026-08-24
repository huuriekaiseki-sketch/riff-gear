-- supabase/migrations/0024_review_helpful_votes.sql
-- レビューへの「参考になった」投票機能。専用の投票テーブルを持ち、
-- 「同じユーザーが同じレビューに二重投票できない」ことをDB制約(unique)で保証する。
-- ログイン済みユーザーは誰でも投票できる(自己投票も許容し、購入者限定にはしない)。
-- トグル(取り消し)はアプリ側でinsert/deleteを使い分けるため、updateポリシーは作らない。

create table review_helpful_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references reviews(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, review_id)
);

alter table review_helpful_votes enable row level security;

-- 投票数はどのレビューでも社会的証明として機能するべきなので、
-- reviewsと同じく閲覧は誰でも可能にする(未ログインの閲覧者にも見せる)。
create policy "review_helpful_votes_select_all" on review_helpful_votes
  for select using (true);

create policy "review_helpful_votes_insert_own" on review_helpful_votes
  for insert with check (user_id = auth.uid());

create policy "review_helpful_votes_delete_own" on review_helpful_votes
  for delete using (user_id = auth.uid() or is_admin());

grant select on review_helpful_votes to anon, authenticated, service_role;
grant insert, delete on review_helpful_votes to authenticated, service_role;

-- ROLLBACK:
-- revoke select, insert, delete on review_helpful_votes from anon, authenticated, service_role;
-- drop policy if exists "review_helpful_votes_delete_own" on review_helpful_votes;
-- drop policy if exists "review_helpful_votes_insert_own" on review_helpful_votes;
-- drop policy if exists "review_helpful_votes_select_all" on review_helpful_votes;
-- drop table if exists review_helpful_votes;
