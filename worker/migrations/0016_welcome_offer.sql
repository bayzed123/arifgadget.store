-- The starter offer still carried the wholesale pitch the hero banner used to
-- run: "Volume pricing on every carton". Arif Gadget Store sells single items
-- to walk-in customers, so the strip under the banner was the last place on
-- the front page still talking to a reseller.
--
-- The WHERE clause matters. This row is editable in the dashboard under
-- Offers & popup, and if staff have already written their own offer, that is
-- the shop's own words and this migration must leave them alone. It only
-- rewrites the row while it still holds the untouched seeded text.
UPDATE banners
   SET title = 'Welcome to Arif Gadget Store',
       subtitle = 'Genuine gadgets, honest prices, and cash on delivery anywhere in Bangladesh.',
       link_url = '/catalog',
       cta_label = 'Start shopping'
 WHERE id = 1
   AND title = 'Volume pricing on every carton';
