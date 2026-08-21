-- Real, honest inputs for the weekly developer report (see devReport.ts):
-- every Gemini call this codebase makes, every unhandled Worker error, and
-- a history of the reports themselves so each week's report can note what
-- changed since the last one.

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The Env key name of whichever Gemini feature made the call
  -- (ADMIN_GEMINI_API_KEY / SUPPORT_GEMINI_API_KEY / ALERT_GEMINI_API_KEY /
  -- DEVLOPER_REPORT_GEMENI), so usage and error rates can be broken out per
  -- feature rather than lumped together.
  feature    TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  error      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature_time ON ai_usage_log(feature, created_at);

CREATE TABLE IF NOT EXISTS error_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT NOT NULL DEFAULT '',
  status     INTEGER NOT NULL DEFAULT 500,
  message    TEXT NOT NULL DEFAULT '',
  -- Split out at write time so a report can separate "something broke in
  -- the dashboard" from "something broke on the storefront" without having
  -- to guess from the path string every time it reads this table.
  is_admin   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_error_log_time ON error_log(created_at DESC);

CREATE TABLE IF NOT EXISTS dev_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  status     TEXT NOT NULL DEFAULT '',
  summary    TEXT NOT NULL DEFAULT '',
  error      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_dev_reports_time ON dev_reports(created_at DESC);
