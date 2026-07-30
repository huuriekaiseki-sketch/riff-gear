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
