-- Arif Gadgets — catalogue seed. Prices are BDT in poisha (৳1 = 100).

INSERT OR IGNORE INTO categories (slug, name, icon, sort_order) VALUES
  ('smartphones', 'Smartphones',   '📱', 1),
  ('audio',       'Audio',         '🎧', 2),
  ('wearables',   'Wearables',     '⌚', 3),
  ('power',       'Power & Charging', '⚡', 4),
  ('computing',   'Computing',     '💻', 5),
  ('smart-home',  'Smart Home',    '🏠', 6),
  ('cameras',     'Cameras',       '📷', 7),
  ('accessories', 'Accessories',   '🔌', 8);

-- ---------- Smartphones ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-PH-001','redmi-note-14-pro','Xiaomi Redmi Note 14 Pro 8/256GB','Xiaomi',id,
 '6.67" 120Hz AMOLED · 200MP OIS · 5110mAh',
 'Flagship-grade 200MP OIS camera in a mid-range shell. 6.67-inch 1.5K AMOLED at 120Hz, Snapdragon 7s Gen 3, 5110mAh with 45W wired charging. Dual SIM, IP64, official Bangladesh warranty.',
 2480000,2850000,3200000,42,6,1,'phone,5g,amoled,camera',1,4.6,214 FROM categories WHERE slug='smartphones';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-PH-002','realme-13-pro-plus','Realme 13 Pro+ 12/256GB','Realme',id,
 'Sony LYT-701 · Periscope zoom · 80W',
 'Periscope telephoto with 3x optical reach and Sony LYT-701 main sensor. 12GB RAM, 256GB UFS storage, 80W SuperVOOC fills the 5200mAh cell in 38 minutes.',
 3520000,3990000,4400000,18,5,1,'phone,5g,zoom',1,4.5,96 FROM categories WHERE slug='smartphones';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-PH-003','samsung-galaxy-a56','Samsung Galaxy A56 5G 8/128GB','Samsung',id,
 'Super AMOLED · 6 yrs updates · IP67',
 'Six years of OS and security updates, IP67 water resistance and Gorilla Glass Victus+. Exynos 1580 with a 5000mAh battery and 45W charging.',
 3850000,4290000,0,9,5,1,'phone,5g,samsung',0,4.4,58 FROM categories WHERE slug='smartphones';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-PH-004','infinix-hot-50-pro','Infinix Hot 50 Pro+ 8/256GB','Infinix',id,
 'Slimmest in class · 6.78" 120Hz',
 'A 6.5mm chassis with a 6.78-inch 120Hz AMOLED. Helio G100 Ultimate, 5000mAh, and 33W charging — the volume seller for retail counters.',
 1520000,1790000,1990000,65,10,1,'phone,budget,volume',0,4.2,331 FROM categories WHERE slug='smartphones';

-- ---------- Audio ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-AU-001','soundcore-life-q30','Anker Soundcore Life Q30 ANC','Anker',id,
 'Hybrid ANC · 40h playtime · Hi-Res',
 'Hybrid active noise cancellation with three modes, 40 hours of playback, and 40mm drivers tuned for Hi-Res certification. Folds flat with a hard travel case.',
 620000,780000,890000,54,8,1,'headphones,anc,over-ear',1,4.7,412 FROM categories WHERE slug='audio';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-AU-002','baseus-bowie-e9','Baseus Bowie E9 TWS Earbuds','Baseus',id,
 'BT 5.3 · 35h total · IPX5',
 'Entry TWS built for volume retail. Bluetooth 5.3, 35 hours combined runtime, IPX5 sweat resistance, USB-C. Ships in sealed 20-unit cartons.',
 132000,189000,249000,210,25,5,'earbuds,tws,bulk',0,4.1,876 FROM categories WHERE slug='audio';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-AU-003','jbl-tune-520bt','JBL Tune 520BT Wireless','JBL',id,
 'Pure Bass · 57h · Dual pairing',
 'JBL Pure Bass tuning with 57 hours of runtime and a 3-minute quick charge for 3 extra hours. Connects to two devices at once.',
 505000,620000,0,33,6,1,'headphones,bluetooth',0,4.3,187 FROM categories WHERE slug='audio';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-AU-004','soundpeats-air4-pro','SoundPEATS Air4 Pro','SoundPEATS',id,
 'aptX Lossless · Adaptive ANC 45dB',
 'Snapdragon Sound with aptX Lossless and adaptive ANC rated to 45dB. Multipoint pairing and in-ear detection.',
 398000,495000,0,0,5,1,'earbuds,anc,tws',0,4.5,143 FROM categories WHERE slug='audio';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-AU-005','edifier-r1280db','Edifier R1280DB Bookshelf Speakers','Edifier',id,
 'Bluetooth + optical · 42W RMS',
 'Wood-finish bookshelf pair with optical, coaxial and dual RCA inputs plus Bluetooth. 42W RMS with remote-controlled bass and treble.',
 1180000,1450000,1650000,12,4,1,'speaker,desktop',0,4.6,74 FROM categories WHERE slug='audio';

-- ---------- Wearables ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-WR-001','amazfit-gtr-4','Amazfit GTR 4 Smartwatch','Amazfit',id,
 'Dual-band GPS · 14-day battery · AMOLED',
 'Circular 1.43-inch AMOLED with dual-band GPS, 150+ sport modes and up to 14 days of typical use. Bluetooth calling and offline maps.',
 1560000,1890000,2190000,21,5,1,'watch,gps,fitness',1,4.5,268 FROM categories WHERE slug='wearables';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-WR-002','haylou-watch-2-pro','Haylou Watch 2 Pro','Haylou',id,
 '1.85" HD · BT calling · IP68',
 'Large 1.85-inch display with Bluetooth calling, SpO2 and 100 sport modes at a counter-friendly price. Sold in 3-unit minimums.',
 210000,285000,349000,120,20,3,'watch,budget,bulk',0,4.0,529 FROM categories WHERE slug='wearables';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-WR-003','xiaomi-smart-band-9','Xiaomi Smart Band 9','Xiaomi',id,
 '1.62" AMOLED · 21-day battery',
 'The default fitness band. 1.62-inch AMOLED at 1200 nits, 21-day battery, 150+ workout modes and 5ATM water resistance.',
 340000,425000,490000,88,15,1,'band,fitness,volume',1,4.6,1204 FROM categories WHERE slug='wearables';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-WR-004','apple-watch-se-2-44','Apple Watch SE (2nd gen) 44mm GPS','Apple',id,
 'Retina display · Crash Detection',
 'S8 chip, always-ready Retina display, Crash and Fall Detection, and full watchOS. Aluminium case, GPS model.',
 2480000,2790000,0,4,5,1,'watch,apple,premium',0,4.8,91 FROM categories WHERE slug='wearables';

-- ---------- Power & Charging ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-PW-001','anker-737-powercore','Anker 737 PowerCore 24K 140W','Anker',id,
 '24,000mAh · 140W · Smart display',
 'Charges a 16-inch laptop at full speed. 24,000mAh, 140W bidirectional USB-C, and a smart display reporting live wattage and remaining time.',
 1330000,1650000,1890000,27,5,1,'powerbank,usb-c,laptop',1,4.7,156 FROM categories WHERE slug='power';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-PW-002','baseus-65w-gan','Baseus 65W GaN Charger 3-Port','Baseus',id,
 'GaN II · 2×USB-C + USB-A',
 'Third-generation GaN in a compact folding-pin body. 65W shared across two USB-C and one USB-A port with full PD 3.0 and PPS support.',
 288000,385000,459000,96,15,2,'charger,gan,bulk',0,4.4,388 FROM categories WHERE slug='power';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-PW-003','ugreen-20000-100w','Ugreen 20000mAh 100W Power Bank','Ugreen',id,
 '100W output · Digital readout',
 'Four-port 20,000mAh pack with 100W maximum output and an LED percentage readout. Airline-safe capacity.',
 585000,720000,0,41,8,1,'powerbank,travel',0,4.5,203 FROM categories WHERE slug='power';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-PW-004','xiaomi-33w-charger','Xiaomi 33W Fast Charger + Cable','Xiaomi',id,
 '33W · Cable included · Carton of 10',
 'The everyday replacement charger. 33W with a bundled USB-A to USB-C cable. Priced for counter resale, 10-unit minimum.',
 98000,145000,179000,260,40,10,'charger,budget,bulk',0,4.2,942 FROM categories WHERE slug='power';

-- ---------- Computing ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-CP-001','logitech-mx-master-3s','Logitech MX Master 3S','Logitech',id,
 '8K DPI · Quiet clicks · 3 devices',
 'The desk-standard productivity mouse. 8000 DPI sensor tracks on glass, MagSpeed wheel, and 90% quieter clicks. Flows across three machines.',
 1050000,1290000,1450000,16,4,1,'mouse,productivity',1,4.8,617 FROM categories WHERE slug='computing';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-CP-002','keychron-k2-pro','Keychron K2 Pro Wireless Mechanical','Keychron',id,
 '75% · QMK/VIA · Hot-swap',
 'Aluminium 75% board with QMK/VIA remapping, hot-swappable Gateron switches, and south-facing RGB. Mac and Windows keycaps in the box.',
 1290000,1580000,1790000,11,4,1,'keyboard,mechanical',0,4.7,225 FROM categories WHERE slug='computing';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-CP-003','sandisk-extreme-1tb-ssd','SanDisk Extreme Portable SSD 1TB','SanDisk',id,
 '1050MB/s · IP65 · USB 3.2 Gen 2',
 'Pocket SSD rated 1050MB/s read with IP65 dust and water resistance plus a two-metre drop rating. Hardware AES-256 encryption.',
 940000,1120000,0,23,5,1,'storage,ssd',0,4.6,340 FROM categories WHERE slug='computing';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-CP-004','lenovo-ideapad-slim-3','Lenovo IdeaPad Slim 3 i5 16/512','Lenovo',id,
 'Core i5-12450H · 16GB · 512GB',
 '15.6-inch FHD with a Core i5-12450H, 16GB DDR4 and a 512GB NVMe drive. Backlit keyboard and a 1080p privacy-shutter webcam.',
 6250000,6890000,7400000,6,3,1,'laptop,office',0,4.3,47 FROM categories WHERE slug='computing';

-- ---------- Smart Home ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-SH-001','tapo-c210','TP-Link Tapo C210 Pan/Tilt Camera','TP-Link',id,
 '2K · 360° pan · Night vision',
 '2K resolution with 360-degree pan and 114-degree tilt, motion tracking, and 30-foot night vision. Local microSD or Tapo Care cloud.',
 215000,285000,349000,74,12,2,'camera,security,bulk',0,4.4,556 FROM categories WHERE slug='smart-home';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-SH-002','mi-air-purifier-4-lite','Xiaomi Smart Air Purifier 4 Lite','Xiaomi',id,
 '360° HEPA · 43m² · App control',
 'True HEPA cylinder rated for rooms up to 43 square metres with a 360-degree intake. OLED status panel and Mi Home scheduling.',
 1420000,1690000,1950000,8,3,1,'purifier,home',0,4.5,118 FROM categories WHERE slug='smart-home';

-- ---------- Cameras ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-CM-001','insta360-go-3s','Insta360 GO 3S 64GB','Insta360',id,
 '4K · Magnetic mount · 35g',
 'A 35-gram magnetic action camera shooting 4K with FlowState stabilisation. The Action Pod adds a flip screen and extends runtime to 140 minutes.',
 3050000,3450000,0,5,3,1,'camera,action,vlog',1,4.6,88 FROM categories WHERE slug='cameras';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-CM-002','dji-osmo-action-5-pro','DJI Osmo Action 5 Pro','DJI',id,
 '1/1.3" sensor · 4K120 · 47GB built-in',
 'One-inch-class sensor with 4K/120fps, 13.5 stops of dynamic range, and 47GB of onboard storage. Rated to 20 metres without a housing.',
 3820000,4290000,4690000,7,3,1,'camera,action,4k',0,4.7,64 FROM categories WHERE slug='cameras';

-- ---------- Accessories ----------
INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-AC-001','ugreen-6in1-hub','Ugreen 6-in-1 USB-C Hub','Ugreen',id,
 '4K HDMI · 100W PD · SD/TF',
 'Aluminium hub with 4K30 HDMI, two USB-A 3.0, SD and microSD readers, and 100W pass-through charging. Fifteen-centimetre braided tail.',
 252000,345000,429000,130,20,3,'hub,usb-c,bulk',0,4.4,471 FROM categories WHERE slug='accessories';

INSERT OR IGNORE INTO products (sku,slug,name,brand,category_id,summary,description,cost_price,price,compare_at_price,stock,low_stock_threshold,moq,tags,featured,rating,review_count)
SELECT 'AG-AC-002','spigen-rugged-armor','Spigen Rugged Armor Case (Assorted)','Spigen',id,
 'TPU · Carbon texture · Mixed models',
 'Matte TPU shell with air-cushion corners and a carbon-fibre texture. Mixed-model cartons for the top ten selling handsets.',
 88000,145000,199000,340,50,10,'case,bulk,volume',0,4.2,1633 FROM categories WHERE slug='accessories';


-- ---------- Volume price tiers ----------
-- One statement per tier: workerd's SQLite caps how many terms a single
-- compound SELECT may chain together.
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 5,   2795000 FROM products WHERE sku = 'AG-PH-001';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 20,  2720000 FROM products WHERE sku = 'AG-PH-001';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 10,  1720000 FROM products WHERE sku = 'AG-PH-004';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 30,  1650000 FROM products WHERE sku = 'AG-PH-004';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 20,  172000  FROM products WHERE sku = 'AG-AU-002';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 60,  158000  FROM products WHERE sku = 'AG-AU-002';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 150, 148000  FROM products WHERE sku = 'AG-AU-002';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 10,  265000  FROM products WHERE sku = 'AG-WR-002';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 40,  245000  FROM products WHERE sku = 'AG-WR-002';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 10,  398000  FROM products WHERE sku = 'AG-WR-003';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 10,  358000  FROM products WHERE sku = 'AG-PW-002';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 40,  335000  FROM products WHERE sku = 'AG-PW-002';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 30,  134000  FROM products WHERE sku = 'AG-PW-004';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 100, 122000  FROM products WHERE sku = 'AG-PW-004';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 10,  262000  FROM products WHERE sku = 'AG-SH-001';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 12,  318000  FROM products WHERE sku = 'AG-AC-001';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 48,  295000  FROM products WHERE sku = 'AG-AC-001';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 50,  132000  FROM products WHERE sku = 'AG-AC-002';
INSERT OR IGNORE INTO price_tiers (product_id, min_qty, unit_price) SELECT id, 200, 118000  FROM products WHERE sku = 'AG-AC-002';
