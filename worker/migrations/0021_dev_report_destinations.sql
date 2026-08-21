-- Pre-fills the weekly developer report's three destinations (the Doc and
-- two Sheets the owner shared with the service account) so the report is
-- already connected the moment this deploys — no need to open Settings and
-- paste the links in by hand. ON CONFLICT DO NOTHING: if these were ever
-- set some other way before this migration runs, that value wins, not this
-- one.
INSERT INTO settings (key, value, updated_at) VALUES
  ('dev_report_doc_id', '1-ioLvwU9VuhsKuLKX9s2eMyr2-4PNtsI0fq1SeVz7DM', strftime('%s','now')),
  ('dev_report_sheet1_id', '1Km-Hf3Utczl41KbdvI_Rb-wYi8cziGag_xorP6bwthQ', strftime('%s','now')),
  ('dev_report_sheet2_id', '1-xbKSxYWQA4paFtVZOViu_e2lP9lwAVf2SrgO6DUcEY', strftime('%s','now'))
ON CONFLICT(key) DO NOTHING;
