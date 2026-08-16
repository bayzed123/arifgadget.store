import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { notFound } from '../lib/http';

/** Public read access to pages, blog posts and press coverage. */
export const content = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Footer navigation: titles and slugs only, grouped by section. */
content.get('/pages', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT slug, title, section, summary FROM pages
      WHERE published = 1 AND section <> 'hidden'
      ORDER BY section ASC, sort_order ASC, title ASC`,
  ).all<{ slug: string; title: string; section: string; summary: string }>();

  const pages = results ?? [];
  return c.json({
    pages,
    company: pages.filter((p) => p.section === 'company'),
    policy: pages.filter((p) => p.section === 'policy'),
  });
});

content.get('/pages/:slug', async (c) => {
  const page = await c.env.DB.prepare(
    'SELECT slug, title, section, summary, body, updated_at FROM pages WHERE slug = ? AND published = 1',
  )
    .bind(c.req.param('slug'))
    .first();
  if (!page) notFound('Page not found');
  return c.json({ page });
});

content.get('/posts', async (c) => {
  const url = new URL(c.req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 12, 1), 50);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);

  const total = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM posts WHERE published = 1').first<{
    n: number;
  }>();

  const { results } = await c.env.DB.prepare(
    `SELECT slug, title, excerpt, cover_url, author, tags, published_at
       FROM posts WHERE published = 1
      ORDER BY published_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(limit, (page - 1) * limit)
    .all();

  const n = total?.n ?? 0;
  return c.json({ posts: results ?? [], page, limit, total: n, pages: Math.ceil(n / limit) });
});

content.get('/posts/:slug', async (c) => {
  const post = await c.env.DB.prepare(
    `SELECT slug, title, excerpt, body, cover_url, author, tags, published_at, updated_at
       FROM posts WHERE slug = ? AND published = 1`,
  )
    .bind(c.req.param('slug'))
    .first();
  if (!post) notFound('Post not found');

  const { results: more } = await c.env.DB.prepare(
    `SELECT slug, title, excerpt, cover_url, published_at FROM posts
      WHERE published = 1 AND slug <> ? ORDER BY published_at DESC LIMIT 3`,
  )
    .bind(c.req.param('slug'))
    .all();

  return c.json({ post, more: more ?? [] });
});

content.get('/press', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, outlet, url, thumbnail_url, excerpt, published_at
       FROM press WHERE visible = 1
      ORDER BY sort_order ASC, published_at DESC`,
  ).all();
  return c.json({ press: results ?? [] });
});
