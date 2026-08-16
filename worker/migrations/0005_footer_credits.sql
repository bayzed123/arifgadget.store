-- Footer credits, kept in settings so they can be edited from the dashboard.

INSERT INTO settings (key, value) VALUES ('credit_dev_name', 'SmartGen')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('credit_dev_url', 'https://smartgentools.com')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('credit_author_name', 'Sayad Bayezid')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('credit_author_url', 'https://sayadbayezid.com')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');
