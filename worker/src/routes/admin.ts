import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables, AdminClaims } from '../types';
import {
  audit,
  badRequest,
  conflict,
  notFound,
  optionalInt,
  optionalString,
  readJson,
  requireInt,
  requireString,
  slugify,
  unauthorized,
} from '../lib/http';
import { hashPassword, randomSalt, signToken, verifyPassword, verifyToken } from '../lib/auth';
import { PRODUCT_COLUMNS, loadTiers, toAdminProduct, type ProductRow } from '../lib/catalog';

const SESSION_HOURS = 12;
/**
 * Courier-style delivery checkpoints. Two stored values carry a friendlier
 * label on screen, because `orders.status` has a CHECK constraint from the
 * first migration and rebuilding that table on a live shop is not worth a
 * rename (see migration 0009):
 *
 *   shipped  → "On the way"
 *   refunded → "Returned"
 */
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'refunded', 'cancelled'];

/** "returned" is the word everyone uses; accept it and store the legacy value. */
const STATUS_ALIASES: Record<string, string> = { returned: 'refunded', on_the_way: 'shipped' };

/**
 * Which checkpoint may follow which. This is not decoration: `returned` and
 * `cancelled` put every unit back on the shelf, so a route back into the
 * pipeline would leave stock credited twice and the ledger telling a lie.
 * Terminal states are therefore terminal.
 */
const NEXT_STATUSES: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  refunded: [],
  cancelled: [],
};

/** What the shop calls each checkpoint, for error messages staff will read. */
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Order confirmed',
  shipped: 'On the way',
  delivered: 'Delivered',
  refunded: 'Returned',
  cancelled: 'Cancelled',
};
const label = (status: string) => STATUS_LABELS[status] ?? status;

export const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

function secret(env: Env): string {
  if (!env.JWT_SECRET) {
    throw new HTTPException(500, {
      message: 'JWT_SECRET is not configured. Run: wrangler secret put JWT_SECRET',
    });
  }
  return env.JWT_SECRET;
}

/** Guards every route below except /setup and /login. */
admin.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.endsWith('/admin/login') || path.endsWith('/admin/setup')) return next();

  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) unauthorized('Missing bearer token');

  const claims = await verifyToken(token, secret(c.env));
  if (!claims) unauthorized('Session expired or invalid — sign in again');
  // A customer token is signed with the same key; it must never open a staff route.
  if (claims.kind !== 'admin') unauthorized('This area is for staff accounts');

  c.set('admin', claims);
  return next();
});

function requireOwner(c: { get: (k: 'admin') => AdminClaims }) {
  const role = c.get('admin').role;
  if (role !== 'owner' && role !== 'admin') {
    throw new HTTPException(403, { message: 'This action needs an admin or owner account' });
  }
}

// ---------------------------------------------------------------- auth

/** First-run only: creates the very first account, then permanently 409s. */
admin.post('/setup', async (c) => {
  const existing = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) conflict('An administrator already exists. Use /admin/login.');

  const body = await readJson(c);
  const username = requireString(body.username, 'username', 60).toLowerCase();
  const name = requireString(body.name, 'name', 120);
  const password = requireString(body.password, 'password', 200);
  // Email is optional at setup; a placeholder keeps the NOT NULL/UNIQUE column happy.
  const email = optionalString(body.email, '', 160).toLowerCase() || `${username}@local`;
  if (password.length < 10) badRequest('Password must be at least 10 characters');

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  await c.env.DB.prepare(
    "INSERT INTO admins (email, username, name, password_hash, salt, role) VALUES (?, ?, ?, ?, ?, 'owner')",
  )
    .bind(email, username, name, hash, salt)
    .run();

  await audit(c.env, username, 'admin.setup', 'admin', username, 'First owner account created');
  return c.json({ ok: true, username }, 201);
});

admin.post('/login', async (c) => {
  const body = await readJson(c);
  // Staff sign in with a username; `email` is still accepted so older clients
  // and email-only accounts keep working.
  const identifier = requireString(body.username ?? body.email, 'username', 160).toLowerCase();
  const password = requireString(body.password, 'password', 200);

  const row = await c.env.DB.prepare(
    `SELECT id, email, username, name, role, password_hash, salt
       FROM admins
      WHERE lower(email) = ?1 OR lower(username) = ?1`,
  )
    .bind(identifier)
    .first<{
      id: number;
      email: string;
      username: string | null;
      name: string;
      role: AdminClaims['role'];
      password_hash: string;
      salt: string;
    }>();

  // Hash even when the account is missing so timing doesn't reveal valid emails.
  const ok = row
    ? await verifyPassword(password, row.salt, row.password_hash)
    : (await hashPassword(password, randomSalt()), false);

  if (!row || !ok) unauthorized('Wrong username or password');

  const claims: AdminClaims = {
    kind: 'admin',
    sub: row.id,
    email: row.email,
    username: row.username ?? row.email,
    name: row.name,
    role: row.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600,
  };

  await c.env.DB.prepare("UPDATE admins SET last_login_at = strftime('%s','now') WHERE id = ?")
    .bind(row.id)
    .run();

  return c.json({
    token: await signToken(claims, secret(c.env)),
    admin: { id: row.id, email: row.email, username: claims.username, name: row.name, role: row.role },
    expires_at: claims.exp,
  });
});

admin.get('/me', (c) => c.json({ admin: c.get('admin') }));

// ---------------------------------------------------------------- products

admin.get('/products', async (c) => {
  const url = new URL(c.req.url);
  const q = url.searchParams.get('q')?.trim();
  const status = url.searchParams.get('status')?.trim();
  const stockState = url.searchParams.get('stock_state')?.trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);

  const where: string[] = ['1 = 1'];
  const binds: unknown[] = [];
  if (status && status !== 'all') {
    where.push('p.status = ?');
    binds.push(status);
  }
  if (stockState && ['ok', 'low', 'out'].includes(stockState)) {
    where.push('p.stock_state = ?');
    binds.push(stockState);
  }
  if (q) {
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM products p WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first<{ n: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${whereSql} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, (page - 1) * limit)
    .all<ProductRow>();

  const rows = results ?? [];
  const tiers = await loadTiers(c.env, rows.map((r) => r.id));
  const total = totalRow?.n ?? 0;

  return c.json({
    products: rows.map((r) => toAdminProduct(r, tiers.get(r.id) ?? [])),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  });
});

admin.get('/products/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare(
    `SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
  )
    .bind(id)
    .first<ProductRow>();
  if (!row) notFound('Product not found');

  const tiers = await loadTiers(c.env, [id]);
  return c.json({ product: toAdminProduct(row, tiers.get(id) ?? []) });
});

async function writeTiers(env: Env, productId: number, raw: unknown) {
  if (!Array.isArray(raw)) return;
  const tiers = raw
    .map((t) => {
      const tier = t as Record<string, unknown>;
      return { min_qty: Number(tier.min_qty), unit_price: Number(tier.unit_price) };
    })
    .filter((t) => Number.isInteger(t.min_qty) && t.min_qty >= 1 && Number.isInteger(t.unit_price) && t.unit_price >= 0);

  const statements = [env.DB.prepare('DELETE FROM price_tiers WHERE product_id = ?').bind(productId)];
  const seen = new Set<number>();
  for (const tier of tiers) {
    if (seen.has(tier.min_qty)) continue;
    seen.add(tier.min_qty);
    statements.push(
      env.DB.prepare('INSERT INTO price_tiers (product_id, min_qty, unit_price) VALUES (?, ?, ?)').bind(
        productId,
        tier.min_qty,
        tier.unit_price,
      ),
    );
  }
  await env.DB.batch(statements);
}

admin.post('/products', async (c) => {
  requireOwner(c);
  const body = await readJson(c);

  const name = requireString(body.name, 'name', 200);
  const price = requireInt(body.price, 'price');
  const cost_price = optionalInt(body.cost_price, 0);
  const sku = optionalString(body.sku, '', 40) || `AG-${Date.now().toString(36).toUpperCase()}`;
  const slug = slugify(optionalString(body.slug, '') || name) || `product-${Date.now()}`;

  const duplicate = await c.env.DB.prepare('SELECT id FROM products WHERE sku = ? OR slug = ?')
    .bind(sku, slug)
    .first();
  if (duplicate) conflict(`A product already uses SKU "${sku}" or slug "${slug}"`);

  const result = await c.env.DB.prepare(
    `INSERT INTO products (sku, slug, name, brand, category_id, summary, description,
                           cost_price, price, compare_at_price, stock, low_stock_threshold, moq,
                           image_url, gallery, specs, tags, status, featured)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  )
    .bind(
      sku,
      slug,
      name,
      optionalString(body.brand, '', 80),
      body.category_id ? Number(body.category_id) : null,
      optionalString(body.summary, '', 300),
      optionalString(body.description, '', 5000),
      cost_price,
      price,
      optionalInt(body.compare_at_price, 0),
      optionalInt(body.stock, 0),
      optionalInt(body.low_stock_threshold, 5),
      optionalInt(body.moq, 1, 1),
      optionalString(body.image_url, '', 500),
      JSON.stringify(Array.isArray(body.gallery) ? body.gallery.slice(0, 12) : []),
      JSON.stringify(typeof body.specs === 'object' && body.specs ? body.specs : {}),
      optionalString(body.tags, '', 300),
      ['active', 'draft', 'archived'].includes(String(body.status)) ? String(body.status) : 'active',
      body.featured ? 1 : 0,
    )
    .first<{ id: number }>();

  const id = result!.id;
  await writeTiers(c.env, id, body.tiers);
  await audit(c.env, c.get('admin').username, 'product.create', 'product', id, name);

  return c.json({ ok: true, id, slug, sku }, 201);
});

const TEXT_FIELDS = ['name', 'brand', 'summary', 'description', 'image_url', 'tags'] as const;
const INT_FIELDS = [
  'cost_price',
  'price',
  'compare_at_price',
  'stock',
  'low_stock_threshold',
  'moq',
] as const;

admin.patch('/products/:id', async (c) => {
  requireOwner(c);
  const id = Number(c.req.param('id'));
  const body = await readJson(c);

  const existing = await c.env.DB.prepare('SELECT id, name FROM products WHERE id = ?').bind(id).first();
  if (!existing) notFound('Product not found');

  const sets: string[] = [];
  const binds: unknown[] = [];

  for (const field of TEXT_FIELDS) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(optionalString(body[field], '', field === 'description' ? 5000 : 500));
    }
  }
  for (const field of INT_FIELDS) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(requireInt(body[field], field, field === 'moq' ? 1 : 0));
    }
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!['active', 'draft', 'archived'].includes(status)) badRequest('Invalid status');
    sets.push('status = ?');
    binds.push(status);
  }
  if (body.featured !== undefined) {
    sets.push('featured = ?');
    binds.push(body.featured ? 1 : 0);
  }
  if (body.category_id !== undefined) {
    sets.push('category_id = ?');
    binds.push(body.category_id === null ? null : Number(body.category_id));
  }
  if (body.slug !== undefined) {
    sets.push('slug = ?');
    binds.push(slugify(String(body.slug)));
  }
  if (body.gallery !== undefined) {
    sets.push('gallery = ?');
    binds.push(JSON.stringify(Array.isArray(body.gallery) ? body.gallery.slice(0, 12) : []));
  }
  if (body.specs !== undefined) {
    sets.push('specs = ?');
    binds.push(JSON.stringify(typeof body.specs === 'object' && body.specs ? body.specs : {}));
  }

  if (sets.length) {
    sets.push("updated_at = strftime('%s','now')");
    try {
      await c.env.DB.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...binds, id)
        .run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/UNIQUE/i.test(message)) conflict('That SKU or slug is already taken');
      if (/CHECK constraint/i.test(message)) badRequest('Stock cannot go below zero');
      throw err;
    }
  }

  if (body.tiers !== undefined) await writeTiers(c.env, id, body.tiers);
  await audit(c.env, c.get('admin').username, 'product.update', 'product', id, sets.join(', '));

  return c.json({ ok: true, updated: sets.length });
});

/** Archive rather than delete — order history must keep pointing at real rows. */
admin.delete('/products/:id', async (c) => {
  requireOwner(c);
  const id = Number(c.req.param('id'));
  const res = await c.env.DB.prepare("UPDATE products SET status = 'archived' WHERE id = ?").bind(id).run();
  if (!res.meta.changes) notFound('Product not found');
  await audit(c.env, c.get('admin').username, 'product.archive', 'product', id);
  return c.json({ ok: true });
});

/**
 * Stock adjustment. Pass `delta` to add/remove, or `set` to force an absolute
 * count. Either way the trigger writes the ledger entry.
 */
admin.post('/products/:id/stock', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c);

  const product = await c.env.DB.prepare('SELECT id, name, stock, cost_price FROM products WHERE id = ?')
    .bind(id)
    .first<{ id: number; name: string; stock: number; cost_price: number }>();
  if (!product) notFound('Product not found');

  const hasDelta = body.delta !== undefined;
  const hasSet = body.set !== undefined;
  if (hasDelta === hasSet) badRequest('Provide exactly one of "delta" or "set"');

  const target = hasSet
    ? requireInt(body.set, 'set', 0)
    : product.stock + requireInt(body.delta, 'delta', -1_000_000, 1_000_000);

  if (target < 0) badRequest(`Cannot remove ${Math.abs(target - product.stock)} units — only ${product.stock} in stock`);

  const reason = ['restock', 'sale', 'return', 'adjustment', 'damage', 'initial'].includes(String(body.reason))
    ? String(body.reason)
    : target > product.stock
      ? 'restock'
      : 'adjustment';
  const note = optionalString(body.note, '', 300);

  // Write the ledger row explicitly so reason/note/actor are accurate; the
  // guard in trg_products_stock_au then sees this row and stays quiet.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO stock_movements (product_id, delta, reason, ref_type, balance_after, unit_cost, note, actor)
       VALUES (?, ?, ?, 'manual', ?, ?, ?, ?)`,
    ).bind(id, target - product.stock, reason, target, product.cost_price, note, c.get('admin').username),
    c.env.DB.prepare("UPDATE products SET stock = ?, updated_at = strftime('%s','now') WHERE id = ?").bind(
      target,
      id,
    ),
  ]);

  await audit(
    c.env,
    c.get('admin').username,
    'product.stock',
    'product',
    id,
    `${product.stock} → ${target} (${reason})`,
  );

  return c.json({ ok: true, product_id: id, previous: product.stock, stock: target, reason });
});

admin.get('/products/:id/movements', async (c) => {
  const id = Number(c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    `SELECT id, delta, reason, ref_type, ref_id, balance_after, unit_cost, note, actor, created_at
       FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
  )
    .bind(id)
    .all();
  return c.json({ movements: results ?? [] });
});

// ---------------------------------------------------------------- categories

admin.post('/categories', async (c) => {
  requireOwner(c);
  const body = await readJson(c);
  const name = requireString(body.name, 'name', 80);
  const slug = slugify(optionalString(body.slug, '') || name);
  const icon = optionalString(body.icon, '📦', 8);
  const sort_order = optionalInt(body.sort_order, 99);

  try {
    const row = await c.env.DB.prepare(
      'INSERT INTO categories (slug, name, icon, sort_order) VALUES (?, ?, ?, ?) RETURNING id',
    )
      .bind(slug, name, icon, sort_order)
      .first<{ id: number }>();
    await audit(c.env, c.get('admin').username, 'category.create', 'category', row!.id, name);
    return c.json({ ok: true, id: row!.id, slug }, 201);
  } catch (err) {
    if (/UNIQUE/i.test(err instanceof Error ? err.message : '')) conflict(`Category "${slug}" already exists`);
    throw err;
  }
});

admin.delete('/categories/:id', async (c) => {
  requireOwner(c);
  const id = Number(c.req.param('id'));
  const res = await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  if (!res.meta.changes) notFound('Category not found');
  await audit(c.env, c.get('admin').username, 'category.delete', 'category', id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- orders

admin.get('/orders', async (c) => {
  const url = new URL(c.req.url);
  const status = url.searchParams.get('status')?.trim();
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 40, 1), 200);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);

  const where: string[] = ['1 = 1'];
  const binds: unknown[] = [];
  if (status && status !== 'all' && ORDER_STATUSES.includes(status)) {
    where.push('status = ?');
    binds.push(status);
  }
  if (q) {
    where.push('(order_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.order_no, o.customer_name, o.customer_phone, o.city, o.status,
            o.subtotal, o.discount, o.shipping, o.tax, o.total, o.cost_total, o.profit,
            o.margin_pct, o.payment_method, o.created_at,
            (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = o.id) AS units
       FROM orders o WHERE ${whereSql}
      ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, (page - 1) * limit)
    .all();

  const total = totalRow?.n ?? 0;
  return c.json({ orders: results ?? [], page, limit, total, pages: Math.ceil(total / limit) });
});

admin.get('/orders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) notFound('Order not found');

  const { results } = await c.env.DB.prepare(
    `SELECT id, product_id, sku, name, image_url, qty, unit_price, unit_cost,
            line_total, line_cost, line_profit
       FROM order_items WHERE order_id = ?`,
  )
    .bind(id)
    .all();

  return c.json({ order, items: results ?? [] });
});

/** Status changes drive the restock trigger, so this is the only way to move an order. */
admin.patch('/orders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c);

  const current = await c.env.DB.prepare('SELECT id, order_no, status FROM orders WHERE id = ?')
    .bind(id)
    .first<{ id: number; order_no: string; status: string }>();
  if (!current) notFound('Order not found');

  const sets: string[] = [];
  const binds: unknown[] = [];

  if (body.status !== undefined) {
    const raw = String(body.status);
    const status = STATUS_ALIASES[raw] ?? raw;
    if (!ORDER_STATUSES.includes(status)) {
      badRequest(`Status must be one of: ${ORDER_STATUSES.map(label).join(', ')}`);
    }

    if (status !== current.status) {
      const allowed = NEXT_STATUSES[current.status] ?? [];
      if (!allowed.includes(status)) {
        badRequest(
          allowed.length
            ? `An order at "${label(current.status)}" can only move to: ${allowed.map(label).join(' or ')}`
            : `"${label(current.status)}" is the final checkpoint — this order cannot be moved again`,
        );
      }
    }

    sets.push('status = ?');
    binds.push(status);
  }
  for (const field of ['discount', 'shipping', 'tax'] as const) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(requireInt(body[field], field));
    }
  }
  if (body.note !== undefined) {
    sets.push('note = ?');
    binds.push(optionalString(body.note, '', 500));
  }
  if (!sets.length) badRequest('Nothing to update');

  await c.env.DB.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, id)
    .run();

  await audit(
    c.env,
    c.get('admin').username,
    'order.update',
    'order',
    id,
    `${current.order_no}: ${current.status} → ${body.status ?? current.status}`,
  );

  const updated = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  return c.json({ ok: true, order: updated });
});

// ---------------------------------------------------------------- media

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Structural stand-in: the workers-types FormData signature reports string values only. */
interface UploadedFile {
  name: string;
  type: string;
  size: number;
  stream(): ReadableStream;
}

function isUploadedFile(value: unknown): value is UploadedFile {
  return typeof value === 'object' && value !== null && 'stream' in value && 'size' in value;
}

admin.post('/uploads', async (c) => {
  if (!c.env.MEDIA) {
    throw new HTTPException(503, {
      message:
        'Image upload is off because R2 storage is not enabled on this Cloudflare account. ' +
        'Enable R2 in the Cloudflare dashboard and re-run the deploy, or paste an image URL instead.',
    });
  }

  const form = await c.req.raw.formData().catch(() => badRequest('Send a multipart/form-data body'));
  const file: unknown = form.get('file');
  if (!isUploadedFile(file)) badRequest('Attach the image as the "file" field');

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    badRequest(`Unsupported type "${file.type}". Use JPEG, PNG, WebP, AVIF or SVG.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) badRequest('Images must be 5 MB or smaller');

  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `products/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await c.env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  await audit(c.env, c.get('admin').username, 'media.upload', 'file', key, `${file.size} bytes`);
  return c.json({ ok: true, key, url: `/files/${key}` }, 201);
});

// ---------------------------------------------------------------- settings & audit

admin.get('/settings', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings ORDER BY key').all();
  return c.json({ settings: results ?? [] });
});

/**
 * The footer build credits are fixed. They are part of the agreement under
 * which the site was built, so no dashboard role — owner included — can edit
 * them, and the API refuses them rather than silently dropping them.
 */
const LOCKED_SETTINGS = new Set(['credit_dev_name', 'credit_dev_url', 'credit_author_name', 'credit_author_url']);

admin.patch('/settings', async (c) => {
  requireOwner(c);
  const body = await readJson(c);
  const entries = Object.entries(body).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
  if (!entries.length) badRequest('Send at least one setting as a string or number');

  const locked = entries.filter(([key]) => LOCKED_SETTINGS.has(key)).map(([key]) => key);
  if (locked.length) {
    badRequest(`These settings are fixed and cannot be changed: ${locked.join(', ')}`);
  }

  await c.env.DB.batch(
    entries.map(([key, value]) =>
      c.env.DB.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%s','now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).bind(key.slice(0, 60), String(value).slice(0, 500)),
    ),
  );

  await audit(c.env, c.get('admin').username, 'settings.update', 'settings', '', entries.map(([k]) => k).join(', '));
  return c.json({ ok: true, updated: entries.length });
});

/**
 * Registered shoppers, with the order history rolled up per account so the
 * dashboard can rank them without a second round trip. Password material is
 * never selected — there is no dashboard reason to read it.
 */
admin.get('/customers', async (c) => {
  const url = new URL(c.req.url);
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);

  const where: string[] = ['1 = 1'];
  const binds: unknown[] = [];
  if (q) {
    where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.city LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM customers c WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.phone, c.email, c.address, c.city, c.created_at, c.last_login_at,
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders,
            (SELECT COALESCE(SUM(o.total),0) FROM orders o
              WHERE o.customer_id = c.id AND o.counts_as_sale = 1) AS spent,
            (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order_at
       FROM customers c WHERE ${whereSql}
      ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, (page - 1) * limit)
    .all();

  const total = totalRow?.n ?? 0;
  return c.json({ customers: results ?? [], page, limit, total, pages: Math.ceil(total / limit) });
});

/** One shopper, with every order they have placed. */
admin.get('/customers/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const customer = await c.env.DB.prepare(
    `SELECT id, name, phone, email, address, city, created_at, last_login_at
       FROM customers WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!customer) notFound('Customer not found');

  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.order_no, o.status, o.total, o.profit, o.payment_method, o.city, o.created_at,
            (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = o.id) AS units
       FROM orders o WHERE o.customer_id = ?
      ORDER BY o.created_at DESC LIMIT 100`,
  )
    .bind(id)
    .all();

  return c.json({ customer, orders: results ?? [] });
});

admin.get('/audit', async (c) => {
  const limit = Math.min(Math.max(Number(new URL(c.req.url).searchParams.get('limit')) || 50, 1), 200);
  const { results } = await c.env.DB.prepare(
    'SELECT id, actor, action, entity, entity_id, detail, created_at FROM audit_log ORDER BY id DESC LIMIT ?',
  )
    .bind(limit)
    .all();
  return c.json({ entries: results ?? [] });
});
