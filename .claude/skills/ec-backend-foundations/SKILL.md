---
name: ec-backend-foundations
description: EC/Webサイトのバックエンド「土台」機能(在庫排他制御・決済・RLS認可・購入者限定書き込み・重複防止・サインアップ自動化)を実装するときに、riff-gearで実際に踏んだ設計判断とレシピを参照する。新しいテーブル・RPC・RLSポリシーを設計する場面、在庫や注文など同時実行が絡む機能を作る場面、「このテーブルの権限どう設計する？」と迷う場面で使う。
---

# EC/Webバックエンド「土台」レシピ集

riff-gear(バンド機材ECサイト)の実装を通じて実際に踏んだ設計判断のカタログ。
どのECサイトにもだいたい共通する「土台」部分(在庫・決済・認可)をレシピ化したもので、
店の意向やUIなど「差別化要因」は含まない。

**このスキルは実装経験からのみ育てる**([riff-gear issue #13](https://github.com/huuriekaiseki-sketch/riff-gear/issues/13)の方針)。
新しいレシピを追加するときは、実際に実装してテストが通ってから追記すること。想定だけで書かない。

## 1. RLSの2パターン: 公開読み取り型 / 本人限定型

テーブルごとに「誰が読めるか」で設計を分ける。

**公開読み取り型**(products, reviews): 閲覧は未ログインでも誰でも可、書き込みだけ制限する。
```sql
create policy "products_select_all" on products for select using (true);
create policy "products_write_admin_only" on products for all using (is_admin()) with check (is_admin());
```

**本人限定型**(profiles, carts, orders, favorites): 自分の行だけ読み書き可、adminは全件読み取り可。
```sql
create policy "carts_select_own_or_admin" on carts for select using (user_id = auth.uid() or is_admin());
create policy "carts_write_own" on carts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

`is_admin()`はSQL関数として一度だけ定義し、全ポリシーから再利用する:
```sql
create or replace function is_admin() returns boolean as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$ language sql stable;
```

新しいテーブルを追加したら、まずこの2パターンのどちらに該当するか判断してから書き始める。

## 2. RLSポリシーだけでは不十分。GRANTも明示する

RLSポリシーが許可していても、テーブル自体へのGRANTが無いと`permission denied for table`になる。
ダッシュボード経由で個別に権限を付けていると気づかず本番だけ動く/CIだけ落ちる、という事故が起きた
(riff-gear 0006_grants.sqlで発覚)。新しいテーブルを作ったら必ずセットで書く:
```sql
grant select on <table> to anon, authenticated, service_role;  -- 公開読み取り型
grant insert, update, delete on <table> to authenticated, service_role;
```
GRANTは「土台」、RLSが「最終的なアクセス制御」という役割分担を意識する。

## 3. 在庫の排他制御: `FOR UPDATE` + SECURITY DEFINER RPC

在庫を減らす処理(注文確定など)は、必ず1つのSECURITY DEFINER関数の中で`FOR UPDATE`ロックを取ってから
在庫チェック→更新を行う。複数商品をまとめて処理する場合は`order by product_id`で必ず同じ順序にロックし、
デッドロックを防ぐ。
```sql
for r in
  select ci.product_id, ci.quantity, p.stock
  from cart_items ci join products p on p.id = ci.product_id
  where ci.cart_id = v_cart_id
  order by ci.product_id
  for update of p
loop
  if r.stock < r.quantity then raise exception '在庫不足: product_id=%', r.product_id; end if;
  update products set stock = stock - r.quantity where id = r.product_id;
end loop;
```
アプリ側で「SELECTして在庫確認→UPDATE」を別々に行うと競合状態(TOCTOU)になるので絶対にしない。

## 4. read-then-writeの競合は`ON CONFLICT`で解消する

「既存行があればUPDATE、無ければINSERT」をアプリ側でSELECT→分岐すると、連続操作(例: カートに
同じ商品を素早く連打)で片方が失われることがある。DB側で単一ステートメントにする:
```sql
insert into cart_items (cart_id, product_id, quantity)
values (p_cart_id, p_product_id, p_quantity)
on conflict (cart_id, product_id) do update set quantity = cart_items.quantity + excluded.quantity;
```

## 5. 「購入者だけが書き込める」はRLSのEXISTS判定で強制する

レビューのように「実際に買った人だけが投稿できる」制約は、アプリ側の事前チェックに頼らずRLSの
INSERTポリシーで強制する。アプリ側のチェックは回避されうるが、DB側は回避できない。
```sql
create policy "reviews_insert_purchasers_only" on reviews
  for insert with check (
    user_id = auth.uid() and exists (
      select 1 from order_items oi join orders o on o.id = oi.order_id
      where oi.product_id = reviews.product_id
        and o.user_id = auth.uid()
        and o.status <> 'cancelled'
    )
  );
```

## 6. 「1ユーザー1エンティティにつき1行」は unique制約 + upsert-as-edit

お気に入り・レビューのように「同じ商品に何度も登録できると困る」ものは`unique(user_id, product_id)`を
DB制約で保証し、アプリ側は「既存行があればUPDATE、無ければINSERT」という上書き投稿として扱う
(SELECTしてから分岐で十分。書き込み頻度が低いUI操作なので#4のON CONFLICTほど厳密でなくてよい)。

## 7. サインアップ時の付随データはDBトリガーで自動作成する

「ユーザー登録時にprofilesも作る」をアプリ側の責務にすると、作り忘れる経路が生まれる
(実際にriff-gearでこれが起きた: サインアップ経路が複数あり、一部でprofiles行が空のままだった)。
`auth.users`へのINSERTをトリガーにしてDB側で保証する:
```sql
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
```

## 8. RLSテストの型: `createTestUser`ヘルパー + 専用ダミー商品

RLSはテストしない限り「書いたつもり」で穴が残る。riff-gearの`tests/rls/*.test.ts`は共通パターン:

- `tests/helpers/test-users.ts`の`createTestUser('customer'|'admin')`で使い捨てユーザーを作り、
  そのユーザーとしてサインイン済みのSupabaseクライアントを得る
- userA/userB/adminの3人を用意し、「自分の行は読み書きできる」「他人の行はできない」
  「adminは他人の行も読める」の3パターンを最低限確認する
- 商品を使うテストは、他の並列実行中のテストファイルと在庫を奪い合わないよう、
  そのテストファイル専用のダミー商品を作ってafterAllで消す
- 「購入済みかどうか」をRLSで判定する機能(レビュー等)のテストは、モックせず実際に
  `place_order` RPCを呼んで本物の注文を作ってから検証する

## 9. Server Actions側は「楽観的UI + revalidatePath」

即座なフィードバックが欲しい操作(カート追加、お気に入りトグル)は`useOptimistic`でクリック直後に
見た目を更新し、Server Action完了後の`revalidatePath`で実際のDB値に補正する。サーバー側で拒否された
場合は自動的に元の値へ戻る。
