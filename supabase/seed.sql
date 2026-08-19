-- supabase/seed.sql
insert into products (name, category, price_cents, stock, image_url) values
  ('Fender Player Stratocaster', 'guitar', 189800, 5, null),
  ('Gibson Les Paul Standard', 'guitar', 349800, 3, null),
  ('Ibanez RG550', 'guitar', 128000, 8, null),
  ('Yamaha Pacifica 112V', 'guitar', 49800, 12, null),
  ('PRS SE Custom 24', 'guitar', 158000, 0, null),
  ('Roland FP-30X', 'keyboard', 98000, 6, null),
  ('Yamaha P-125', 'keyboard', 78000, 10, null),
  ('Korg Minilogue', 'keyboard', 89800, 4, null),
  ('Nord Stage 4', 'keyboard', 498000, 2, null),
  ('Casio CT-S1', 'keyboard', 29800, 15, null),
  ('D''Addario EXL110 弦セット', 'accessory', 980, 50, null),
  ('Boss DS-1 ディストーション', 'accessory', 8800, 20, null),
  ('Fender ストラップ', 'accessory', 3980, 30, null),
  ('Hercules ギタースタンド', 'accessory', 4980, 18, null),
  ('Zoom G1X FOUR', 'accessory', 14800, 0, null);

-- 商品比較機能(issue #18)用の仕様データ。カテゴリごとに項目が異なるため、
-- 商品名で対象を絞ってJSONBのspecs列を更新する。
update products set specs = '{"pickup": "シングルコイル×3(SSS)", "weight_kg": 3.6}' where name = 'Fender Player Stratocaster';
update products set specs = '{"pickup": "ハムバッカー×2", "weight_kg": 4.3}' where name = 'Gibson Les Paul Standard';
update products set specs = '{"pickup": "ハムバッカー×2(HSH)", "weight_kg": 3.4}' where name = 'Ibanez RG550';
update products set specs = '{"pickup": "シングル+シングル+ハム(HSS)", "weight_kg": 3.5}' where name = 'Yamaha Pacifica 112V';
update products set specs = '{"pickup": "ハムバッカー×2", "weight_kg": 3.7}' where name = 'PRS SE Custom 24';

update products set specs = '{"keys": "88鍵", "weight_kg": 14.4}' where name = 'Roland FP-30X';
update products set specs = '{"keys": "88鍵", "weight_kg": 11.8}' where name = 'Yamaha P-125';
update products set specs = '{"keys": "37鍵(ミニ鍵盤)", "weight_kg": 2.8}' where name = 'Korg Minilogue';
update products set specs = '{"keys": "88鍵", "weight_kg": 19.9}' where name = 'Nord Stage 4';
update products set specs = '{"keys": "61鍵", "weight_kg": 3.2}' where name = 'Casio CT-S1';

update products set specs = '{"material": "ニッケルワウンド", "weight_kg": 0.05}' where name = 'D''Addario EXL110 弦セット';
update products set specs = '{"material": "ABS樹脂ケース", "weight_kg": 0.36}' where name = 'Boss DS-1 ディストーション';
update products set specs = '{"material": "ポリエステル", "weight_kg": 0.15}' where name = 'Fender ストラップ';
update products set specs = '{"material": "スチール", "weight_kg": 1.2}' where name = 'Hercules ギタースタンド';
update products set specs = '{"material": "ABS樹脂", "weight_kg": 0.45}' where name = 'Zoom G1X FOUR';
