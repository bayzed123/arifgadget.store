-- Real shop contact details. Stored as settings so they stay editable from the
-- dashboard without a redeploy.

INSERT INTO settings (key, value) VALUES
  ('store_address', 'Alhaj Abdul Mannan Degree College Gate, Zirani, BKSP, Ashulia, Savar, Dhaka')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('support_phone', '01400-290828')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('support_phone_2', '01400-290812')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

-- The floating chat button dials this one.
INSERT INTO settings (key, value) VALUES ('whatsapp_number', '01400-290828')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');
