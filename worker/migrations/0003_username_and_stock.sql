-- Username login for the dashboard, plus the first batch of real stock.

-- Staff sign in with a short username rather than an email address. Email is
-- kept for contact and stays unique; username is optional so existing accounts
-- remain valid.
ALTER TABLE admins ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_username
  ON admins(username) WHERE username IS NOT NULL;


-- ---------- Real stock: smartwatches ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count,specs)
SELECT 'AG-WR-010','y80-ultra-8-in-1','Y80 Ultra 8+1 Smartwatch Gift Box','Ultra Germany',id,
 '8 straps + watch · Wireless charging · Gift box',
 'The complete counter-seller: one Y80 Ultra watch with eight interchangeable straps — braided, silicone, ocean, striped and stainless steel — plus a wireless charging cable and a spare case, all in a printed presentation box. Moves fast as a gift item.',
 175000,229000,279000,60,10,2,'watch,giftbox,bulk,volume',1,4.3,412,
 json_object(
   'Display','1.96" HD full touch',
   'Straps included','8 (braided, silicone, ocean, striped, steel)',
   'Charging','Wireless magnetic',
   'Bluetooth calling','Yes',
   'Box contents','Watch, 8 straps, charger, spare case'
 ) FROM categories WHERE slug='wearables';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count,specs)
SELECT 'AG-WR-011','t900-ultra-2','T900 Ultra 2 Smartwatch','Hiwatch Pro',id,
 '2.02" display · Ocean strap · BT calling',
 'The volume smartwatch. Large 2.02-inch display with an always-on style watch face, Bluetooth calling, heart-rate and SpO2 sensors, and an ocean-style silicone strap. Priced for resale by the carton.',
 85000,115000,149000,150,25,5,'watch,budget,bulk,volume',1,4.1,876,
 json_object(
   'Display','2.02" full touch',
   'Bluetooth calling','Yes',
   'Sensors','Heart rate, SpO2, sleep',
   'Battery','Up to 5 days typical',
   'Strap','Ocean silicone'
 ) FROM categories WHERE slug='wearables';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count,specs)
SELECT 'AG-WR-012','t900-ultra-2-big','T900 Ultra 2 BIG 2.19" Wireless Charging','Hiwatch Pro',id,
 '2.19" infinite display · Wireless charging',
 'The larger T900 Ultra 2. A 2.19-inch infinite-edge display with wireless charging, Bluetooth calling and a full sports suite. Same counter price band as the standard model with a noticeably bigger screen.',
 105000,139000,175000,120,20,5,'watch,bulk,volume,wireless-charging',0,4.2,538,
 json_object(
   'Display','2.19" infinite display',
   'Charging','Wireless',
   'Bluetooth calling','Yes',
   'Sensors','Heart rate, SpO2, sleep',
   'Sport modes','100+'
 ) FROM categories WHERE slug='wearables';

-- ---------- Real stock: audio ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count,specs)
SELECT 'AG-AU-010','hollyland-lark-m2','Hollyland Lark M2 Wireless Microphone','Hollyland',id,
 '9g clip mic · 300m range · 40h case',
 'A 9-gram titanium clip-on wireless mic built for creators. Two transmitters and a receiver in a charging case, 300-metre line-of-sight range, 40 hours of total runtime and environmental noise cancellation. Ships with USB-C and Lightning receivers.',
 1220000,1390000,1590000,14,4,1,'microphone,creator,wireless,vlog',1,4.7,163,
 json_object(
   'Transmitter weight','9 g',
   'Range','300 m line of sight',
   'Runtime','9 h transmitter, 40 h with case',
   'Noise cancellation','Environmental, two levels',
   'In the box','2 transmitters, receiver, charging case, clips'
 ) FROM categories WHERE slug='audio';

-- ---------- Volume tiers for the new lines ----------
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 10,  215000 FROM products WHERE sku = 'AG-WR-010';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 30,  205000 FROM products WHERE sku = 'AG-WR-010';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 20,  106000 FROM products WHERE sku = 'AG-WR-011';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 60,   98000 FROM products WHERE sku = 'AG-WR-011';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 150,  93000 FROM products WHERE sku = 'AG-WR-011';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 20,  129000 FROM products WHERE sku = 'AG-WR-012';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 60,  120000 FROM products WHERE sku = 'AG-WR-012';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 5,  1330000 FROM products WHERE sku = 'AG-AU-010';
