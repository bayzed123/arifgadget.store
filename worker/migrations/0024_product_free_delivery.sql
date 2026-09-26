-- A product-level free-delivery override — set from the admin product editor,
-- distinct from the shop-wide free_shipping_over cart-total threshold in
-- settings. Until now "creating an offer" only ever meant a promotional
-- banner (see the banners table); nothing about a banner touched checkout
-- pricing, so a product marked free-delivery in the admin's mind never
-- actually waived the shipping charge — this column and the pricing.ts logic
-- that reads it are what make that real.
ALTER TABLE products ADD COLUMN free_delivery INTEGER NOT NULL DEFAULT 0 CHECK (free_delivery IN (0,1));
