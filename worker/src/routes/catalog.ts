import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { notFound } from '../lib/http';
import {
  PRODUCT_COLUMNS,
  getSettings,
  loadTiers,
  toPublicProduct,
  type ProductRow,
} from '../lib/catalog';

const SORTS: Record<string, string> = {
  newest: 'p.created_at DESC',
  popular: 'p.units_sold DESC, p.rating DESC',
  price_asc: 'p.price ASC',
  price_desc: 'p.price DESC',
  rating: 'p.rating DESC, p.review_count DESC',
  discount: 'p.discount_pct DESC',
};

export const catalog = new Hono<{ Bindings: Env; Variables: Variables }>();

catalog.get('/settings', async (c) => {
  const settings = await getSettings(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT key, value FROM settings
      WHERE key IN ('store_name','store_tagline','support_phone','support_phone_2',
                    'support_email','store_address','whatsapp_number',
                    'credit_dev_name','credit_dev_url','credit_author_name','credit_author_url',
                    'owner_name','facebook_url')`,
  ).all<{ key: string; value: string }>();
  const info = Object.fromEntries((results ?? []).map((r) => [r.key, r.value]));
  return c.json({ ...settings, ...info });
});

catalog.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.slug, c.name, c.icon, c.sort_order,
            COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC`,
  ).all();
  return c.json({ categories: results ?? [] });
});

catalog.get('/products', async (c) => {
  const url = new URL(c.req.url);
  const category = url.searchParams.get('category')?.trim();
  const q = url.searchParams.get('q')?.trim();
  const brand = url.searchParams.get('brand')?.trim();
  const featured = url.searchParams.get('featured');
  const inStock = url.searchParams.get('in_stock');
  const sort = SORTS[url.searchParams.get('sort') ?? ''] ?? SORTS.newest;

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 24, 1), 60);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const offset = (page - 1) * limit;

  const where: string[] = ["p.status = 'active'"];
  const binds: unknown[] = [];

  if (category) {
    where.push('c.slug = ?');
    binds.push(category);
  }
  if (brand) {
    where.push('p.brand = ?');
    binds.push(brand);
  }
  if (featured === '1' || featured === 'true') where.push('p.featured = 1');
  if (inStock === '1' || inStock === 'true') where.push('p.stock > 0');
  if (q) {
    where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.tags LIKE ? OR p.sku LIKE ? OR p.summary LIKE ?)');
    const like = `%${q}%`;
    binds.push(like, like, like, like, like);
  }

  const whereSql = where.join(' AND ');

  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first<{ n: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${whereSql}
      ORDER BY ${sort}
      LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all<ProductRow>();

  const rows = results ?? [];
  const tiers = await loadTiers(c.env, rows.map((r) => r.id));
  const total = totalRow?.n ?? 0;

  return c.json({
    products: rows.map((row) => toPublicProduct(row, tiers.get(row.id) ?? [])),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  });
});

catalog.get('/products/:slug', async (c) => {
  const slug = c.req.param('slug');
  const row = await c.env.DB.prepare(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ? AND p.status = 'active'`,
  )
    .bind(slug)
    .first<ProductRow>();

  if (!row) notFound('Product not found');

  const tiers = await loadTiers(c.env, [row.id]);

  const { results: related } = await c.env.DB.prepare(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'active' AND p.id <> ? AND p.category_id IS ?
      ORDER BY p.units_sold DESC LIMIT 6`,
  )
    .bind(row.id, row.category_id)
    .all<ProductRow>();

  const relatedRows = related ?? [];
  const relatedTiers = await loadTiers(c.env, relatedRows.map((r) => r.id));

  return c.json({
    product: toPublicProduct(row, tiers.get(row.id) ?? []),
    related: relatedRows.map((r) => toPublicProduct(r, relatedTiers.get(r.id) ?? [])),
  });
});

/** Storefront home payload in a single round trip. */
catalog.get('/storefront', async (c) => {
  const [{ results: cats }, { results: featured }, { results: newest }, { results: deals }] =
    await Promise.all([
      c.env.DB.prepare(
        `SELECT c.id, c.slug, c.name, c.icon, COUNT(p.id) AS product_count
           FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
          GROUP BY c.id ORDER BY c.sort_order ASC`,
      ).all(),
      c.env.DB.prepare(
        `SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.status = 'active' AND p.featured = 1 ORDER BY p.units_sold DESC LIMIT 8`,
      ).all<ProductRow>(),
      c.env.DB.prepare(
        `SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.status = 'active' ORDER BY p.created_at DESC LIMIT 10`,
      ).all<ProductRow>(),
      c.env.DB.prepare(
        `SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.status = 'active' AND p.discount_pct > 0 ORDER BY p.discount_pct DESC LIMIT 10`,
      ).all<ProductRow>(),
    ]);

  const all = [...(featured ?? []), ...(newest ?? []), ...(deals ?? [])];
  const tiers = await loadTiers(c.env, [...new Set(all.map((r) => r.id))]);
  const map = (rows: ProductRow[] | undefined) =>
    (rows ?? []).map((r) => toPublicProduct(r, tiers.get(r.id) ?? []));

  return c.json({
    categories: cats ?? [],
    featured: map(featured),
    newest: map(newest),
    deals: map(deals),
    settings: await getSettings(c.env),
  });
});
