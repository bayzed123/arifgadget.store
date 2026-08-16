-- Content system: company/policy pages, a blog, and press coverage.
-- All three are editable from the dashboard; nothing here is hardcoded in the
-- storefront, so the shop can reword its own policies without a deploy.

CREATE TABLE IF NOT EXISTS pages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  -- which footer column the page belongs to
  section    TEXT NOT NULL DEFAULT 'company' CHECK (section IN ('company','policy','hidden')),
  summary    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 50,
  published  INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_pages_section ON pages(section, sort_order);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  excerpt      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  cover_url    TEXT NOT NULL DEFAULT '',
  author       TEXT NOT NULL DEFAULT '',
  tags         TEXT NOT NULL DEFAULT '',
  published    INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),
  published_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published, published_at DESC);

-- External news coverage. Add a link and a thumbnail in the dashboard and it
-- appears on the site straight away.
CREATE TABLE IF NOT EXISTS press (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  outlet        TEXT NOT NULL DEFAULT '',
  url           TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL DEFAULT '',
  excerpt       TEXT NOT NULL DEFAULT '',
  published_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  visible       INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order    INTEGER NOT NULL DEFAULT 50,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_press_visible ON press(visible, sort_order, published_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_pages_touch
AFTER UPDATE ON pages FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE pages SET updated_at = strftime('%s','now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_posts_touch
AFTER UPDATE ON posts FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE posts SET updated_at = strftime('%s','now') WHERE id = NEW.id;
END;

-- Owner and social links
INSERT INTO settings (key, value) VALUES ('owner_name', 'Ariful Islam Arif')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');
INSERT INTO settings (key, value) VALUES ('facebook_url', 'https://www.facebook.com/arifgadgetstore')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');
