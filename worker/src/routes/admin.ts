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
import {
  activeCourierAccountId,
  codAmountFor,
  courierBalance,
  courierConfigured,
  courierLabel,
  courierPayments,
  createConsignment,
  credentialShape,
} from '../lib/steadfast';
import { encryptSecret } from '../lib/crypto';
import { googleConfigured, googleServiceAccountEmail } from '../lib/googleAuth';
import { ga4Summary, listGa4Properties } from '../lib/googleAnalytics';
import { listSearchConsoleSites, searchConsoleSummary } from '../lib/searchConsole';
import { gtmSummary } from '../lib/googleTagManager';
import { parseSpreadsheetId } from '../lib/googleSheets';
import { runSheetsSync } from '../lib/sheetsSync';
import { ORDER_STATUSES, STATUS_ALIASES, NEXT_STATUSES, label } from '../lib/checkpoints';
import {
  applyCourierCheckpoint,
  syncOrderFromCourier,
  type CourierOrderRow,
  type SyncResult,
} from '../lib/courierSync';

const SESSION_HOURS = 12;

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
    // Slug included so a pasted product URL — or the live preview, which knows
    // a product only by the slug in its address — resolves to the right row.
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ? OR p.slug LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
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

/**
 * Colour names as a clean JSON array.
 *
 * Accepts either a real array or the comma-separated string the dashboard's
 * single text box produces, because asking a shopkeeper to type JSON would be
 * a strange thing to do. Trimmed, de-duplicated, and capped so one paste
 * cannot fill the column.
 */
/**
 * Resolves the category for a product write.
 *
 * Staff can pick an existing category or simply type a new name — a shopkeeper
 * adding the first drone should not have to visit a separate screen to invent
 * "Drones" before they can save. A typed name that already exists is reused
 * rather than duplicated, matched case-insensitively so "Drones" and "drones"
 * do not become two categories.
 *
 * @returns the category id, or null for uncategorised.
 */
async function resolveCategory(env: Env, categoryId: unknown, typedName: unknown): Promise<number | null> {
  const name = typeof typedName === 'string' ? typedName.trim() : '';
  if (name) {
    const slug = slugify(name);
    const existing = await env.DB.prepare(
      'SELECT id FROM categories WHERE slug = ? OR lower(name) = lower(?) LIMIT 1',
    )
      .bind(slug, name)
      .first<{ id: number }>();
    if (existing) return existing.id;

    const created = await env.DB.prepare(
      'INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, 99) RETURNING id',
    )
      .bind(slug, name.slice(0, 60))
      .first<{ id: number }>();
    return created?.id ?? null;
  }

  if (categoryId === null || categoryId === undefined || categoryId === '') return null;
  return Number(categoryId);
}

function parseColours(raw: unknown): string {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const cleaned = [...new Set(list.map((c) => String(c).trim()).filter(Boolean))].slice(0, 20);
  return JSON.stringify(cleaned.map((c) => c.slice(0, 40)));
}

/** Gallery images beyond the main one. See MAX_GALLERY for why the cap exists. */
export const MAX_GALLERY = 11;

/**
 * Cleans a list of extra product photos.
 *
 * Accepts either a real array or the newline/comma separated text a person
 * pastes, because the dashboard offers both a file picker and a URL box and
 * neither should need the other's shape. Duplicates go — the same photo twice
 * is never intended — and the order staff chose is kept, since the first
 * gallery image is the one shown right after the main photo.
 */
function parseGallery(raw: unknown): string {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\n,]/) : [];
  const cleaned = [...new Set(list.map((u) => String(u).trim()).filter(Boolean))]
    .map((u) => u.slice(0, 500))
    .slice(0, MAX_GALLERY);
  return JSON.stringify(cleaned);
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
                           image_url, gallery, specs, tags, status, featured,
                           colours, returnable)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  )
    .bind(
      sku,
      slug,
      name,
      optionalString(body.brand, '', 80),
      await resolveCategory(c.env, body.category_id, body.category_name),
      optionalString(body.summary, '', 300),
      optionalString(body.description, '', 5000),
      cost_price,
      price,
      optionalInt(body.compare_at_price, 0),
      optionalInt(body.stock, 0),
      optionalInt(body.low_stock_threshold, 5),
      optionalInt(body.moq, 1, 1),
      optionalString(body.image_url, '', 500),
      parseGallery(body.gallery),
      JSON.stringify(typeof body.specs === 'object' && body.specs ? body.specs : {}),
      optionalString(body.tags, '', 300),
      ['active', 'draft', 'archived'].includes(String(body.status)) ? String(body.status) : 'active',
      body.featured ? 1 : 0,
      parseColours(body.colours),
      // Returnable unless staff say otherwise: most stock is, and the safer
      // default for a shopper is the one that grants them the policy.
      body.returnable === false ? 0 : 1,
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
  if (body.colours !== undefined) {
    sets.push('colours = ?');
    binds.push(parseColours(body.colours));
  }
  if (body.returnable !== undefined) {
    sets.push('returnable = ?');
    binds.push(body.returnable ? 1 : 0);
  }
  if (body.category_id !== undefined || body.category_name !== undefined) {
    sets.push('category_id = ?');
    binds.push(await resolveCategory(c.env, body.category_id, body.category_name));
  }
  if (body.slug !== undefined) {
    sets.push('slug = ?');
    binds.push(slugify(String(body.slug)));
  }
  if (body.gallery !== undefined) {
    sets.push('gallery = ?');
    binds.push(parseGallery(body.gallery));
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
    // Staff search by whatever the customer quotes: the order number from the
    // confirmation, the invoice number from the printed receipt, a name, or a
    // phone number.
    where.push('(order_no LIKE ? OR invoice_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.join(' AND ');

  /**
   * An exact hit comes first, however old it is.
   *
   * Without this the results were newest-first, so a customer reading out
   * invoice 186 could be answered with a newer order that merely contains
   * "186" in its phone number — and the staff member would have no reason to
   * doubt the top row. The order being asked about should be the one on top.
   *
   * Bare digits are matched against the invoice format too, because nobody
   * reading a receipt over the phone says "I-N-V dash zero zero zero".
   */
  const orderBinds: unknown[] = [];
  let rankSql = '';
  if (q) {
    const asInvoice = /^\d+$/.test(q) ? `INV-${q.padStart(6, '0')}` : q;
    rankSql = 'CASE WHEN upper(o.order_no) = upper(?) OR upper(o.invoice_no) = upper(?) THEN 0 ELSE 1 END, ';
    orderBinds.push(q, asInvoice);
  }

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.order_no, o.invoice_no, o.customer_name, o.customer_phone, o.city, o.status,
            o.subtotal, o.discount, o.shipping, o.tax, o.total, o.cost_total, o.profit,
            o.margin_pct, o.payment_method, o.payment_reference, o.delivery_zone, o.created_at,
            o.courier, o.consignment_id, o.tracking_code, o.courier_status,
            o.courier_cod_amount, o.courier_synced_at,
            (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = o.id) AS units
       FROM orders o WHERE ${whereSql}
      ORDER BY ${rankSql}o.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, ...orderBinds, limit, (page - 1) * limit)
    .all();

  const total = totalRow?.n ?? 0;
  return c.json({ orders: results ?? [], page, limit, total, pages: Math.ceil(total / limit) });
});

admin.get('/orders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) notFound('Order not found');

  const { results } = await c.env.DB.prepare(
    `SELECT id, product_id, sku, name, image_url, qty, unit_price, unit_cost, colour,
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

/** One product's worth of photos in a single pick — see MAX_UPLOAD_FILES. */
const MAX_UPLOAD_FILES = 12;

/**
 * Stores one or more images.
 *
 * Staff select a whole set of photos at once, so the endpoint takes the whole
 * set: one request, one round trip, and either all of them land or the caller
 * is told which one was rejected before anything is written. `url`/`key` still
 * name the first file so a single-image caller sees the shape it always saw.
 */
admin.post('/uploads', async (c) => {
  if (!c.env.MEDIA) {
    throw new HTTPException(503, {
      message:
        'Image upload is off because R2 storage is not enabled on this Cloudflare account. ' +
        'Enable R2 in the Cloudflare dashboard and re-run the deploy, or paste an image URL instead.',
    });
  }

  const form = await c.req.raw.formData().catch(() => badRequest('Send a multipart/form-data body'));
  // getAll is typed as string[] by workers-types; the runtime hands back File
  // objects, which is what isUploadedFile actually checks for.
  const files = (form.getAll('file') as unknown[]).filter(isUploadedFile);
  if (!files.length) badRequest('Attach at least one image as a "file" field');
  if (files.length > MAX_UPLOAD_FILES) badRequest(`Upload at most ${MAX_UPLOAD_FILES} images at a time`);

  // Validate the whole batch first. Half-storing a set and then failing would
  // leave orphans in R2 that nothing in the dashboard ever references again.
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      badRequest(`Unsupported type "${file.type}" for "${file.name}". Use JPEG, PNG, WebP, AVIF or SVG.`);
    }
    if (file.size > MAX_UPLOAD_BYTES) badRequest(`"${file.name}" is over 5 MB. Please shrink it and try again.`);
  }

  const stored: { key: string; url: string }[] = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `products/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    await c.env.MEDIA.put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
    });

    await audit(c.env, c.get('admin').username, 'media.upload', 'file', key, `${file.size} bytes`);
    stored.push({ key, url: `/files/${key}` });
  }

  return c.json({ ok: true, files: stored, key: stored[0].key, url: stored[0].url }, 201);
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
    `SELECT c.id, c.name, c.phone, c.email, c.address, c.city, c.created_at, c.last_login_at, c.active,
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
    `SELECT id, name, phone, email, address, city, created_at, last_login_at, active
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

/**
 * Blocks or restores a customer account. Blocking never deletes anything —
 * the account and every order it placed stay exactly as they are; a blocked
 * customer just can no longer sign in or use an existing session (enforced
 * in account.ts on every /api/account/* request, not only at login).
 */
admin.patch('/customers/:id', async (c) => {
  requireOwner(c);
  const id = Number(c.req.param('id'));
  const body = await readJson(c);
  if (body.active === undefined) badRequest('Provide "active"');

  const existing = await c.env.DB.prepare('SELECT id, name FROM customers WHERE id = ?')
    .bind(id)
    .first<{ id: number; name: string }>();
  if (!existing) notFound('Customer not found');

  const active = body.active ? 1 : 0;
  await c.env.DB.prepare('UPDATE customers SET active = ? WHERE id = ?').bind(active, id).run();

  await audit(
    c.env,
    c.get('admin').username,
    'customer.active',
    'customer',
    id,
    `${existing.name} → ${active ? 'restored' : 'blocked'}`,
  );

  return c.json({ ok: true, active: active === 1 });
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

/* ══════════════════════════ Steadfast courier ══════════════════════════
 *
 * The courier knows things the dashboard cannot: whether a parcel was
 * delivered, whether it came back, and whether the cash was collected. These
 * routes are the shop's side of that conversation.
 *
 * Nothing here books a parcel on its own. Creating a consignment costs real
 * money and puts a real van on a real road, so it is always an explicit action
 * by a member of staff — never a side effect of an order arriving.
 */

/**
 * Connection check. Reads the courier account balance, which proves both keys
 * are right without booking anything, so staff can press it as often as they
 * like. Never returns the keys themselves.
 */
/**
 * Is the courier connected, and if not, why?
 *
 * The "why" is the whole point. This used to answer with a bare boolean and a
 * sentence, which left "the keys were never set" and "Steadfast rejected the
 * keys we sent" looking identical from the dashboard — and those two need
 * completely different fixes. It now reports which keys the Worker holds (never
 * their values), what the courier actually said, and what to do about it.
 */
admin.get('/courier', async (c) => {
  const shape = await credentialShape(c.env);

  if (!(await courierConfigured(c.env))) {
    const missing = [
      shape.api_key_present ? null : 'STEADFAST_API_KEY',
      shape.secret_key_present ? null : 'STEADFAST_SECRET_KEY',
    ].filter(Boolean);

    return c.json({
      connected: false,
      balance: null,
      reason: 'not_configured',
      message: `No courier account is set up. Add one from Settings → Courier accounts, or set ${missing.join(' and ')} as repository secrets and run the deploy again.`,
      fix: 'Settings → Courier accounts → Add account is the quickest path — it takes effect immediately, no redeploy needed.',
      credentials: shape,
    });
  }

  const balance = await courierBalance(c.env);
  if (balance.ok) {
    return c.json({
      connected: true,
      balance: balance.data,
      reason: 'ok',
      message: '',
      fix: '',
      credentials: shape,
    });
  }

  // Both keys are present and Steadfast still said no. Name the likely cause
  // rather than making the owner guess between four very different problems.
  const status = balance.status;
  const reason =
    status === 401 || status === 403 ? 'rejected' : status && status >= 500 ? 'courier_down' : 'unreachable';

  const fix =
    reason === 'rejected'
      ? shape.source === 'dashboard'
        ? `Steadfast received the "${shape.account_label}" account's keys and refused them. Check the API key and secret key in the Steadfast merchant portal, then update this account from Settings → Courier accounts. If the keys are definitely right, ask Steadfast whether your account needs the calling server allow-listed.`
        : 'Steadfast received the keys and refused them. Check the API key and secret key in the Steadfast merchant portal, then update STEAT_FAST_API and STEAT_FAST_SECRET_KEY in the GitHub repository secrets and re-run the Deploy workflow, or add the account fresh from Settings → Courier accounts instead. If the keys are definitely right, ask Steadfast whether your account needs the calling server allow-listed.'
      : reason === 'courier_down'
        ? 'The keys look fine — Steadfast itself is returning an error. Try again shortly; nothing needs changing at this end.'
        : 'Could not reach the Steadfast portal at all. This is usually temporary; if it persists, confirm the portal address with Steadfast.';

  return c.json({
    connected: false,
    balance: null,
    reason,
    status: status ?? null,
    message: balance.error,
    fix,
    credentials: shape,
  });
});

/* ─────────────────────────── courier accounts ───────────────────────────
 *
 * The shop runs more than one Steadfast account. These routes let staff add,
 * switch, and remove them from Settings — no GitHub secret and no redeploy.
 * Keys are encrypted before they touch the database (lib/crypto.ts) and are
 * never sent back to the browser once saved: every response here reports
 * presence and length only, the same discipline GET /courier already follows
 * for the legacy deploy-secret account.
 */

interface CourierAccountRow {
  id: number;
  provider: string;
  label: string;
  api_key_length: number;
  secret_key_length: number;
  base_url: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

function publicAccount(row: CourierAccountRow) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    api_key_present: row.api_key_length > 0,
    secret_key_present: row.secret_key_length > 0,
    api_key_length: row.api_key_length,
    secret_key_length: row.secret_key_length,
    base_url: row.base_url,
    active: row.is_active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

admin.get('/courier/accounts', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, provider, label, api_key_length, secret_key_length, base_url, is_active, created_at, updated_at
       FROM courier_accounts ORDER BY is_active DESC, created_at ASC`,
  ).all<CourierAccountRow>();
  return c.json({ accounts: (results ?? []).map(publicAccount) });
});

/** Adds an account. The first one added is made active automatically — otherwise nothing would be connected. */
admin.post('/courier/accounts', async (c) => {
  requireOwner(c);
  const body = await readJson(c);
  const label = requireString(body.label, 'label', 60);
  const apiKey = requireString(body.api_key, 'api_key', 200);
  const secretKey = requireString(body.secret_key, 'secret_key', 200);
  const baseUrl = optionalString(body.base_url, '', 200).replace(/\/$/, '');

  const [apiKeyEnc, secretKeyEnc] = await Promise.all([
    encryptSecret(secret(c.env), apiKey),
    encryptSecret(secret(c.env), secretKey),
  ]);

  const existing = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM courier_accounts WHERE provider = 'steadfast'",
  ).first<{ n: number }>();
  const makeActive = (existing?.n ?? 0) === 0 || body.make_active === true;

  if (makeActive) {
    await c.env.DB.prepare("UPDATE courier_accounts SET is_active = 0 WHERE provider = 'steadfast'").run();
  }

  const inserted = await c.env.DB.prepare(
    `INSERT INTO courier_accounts
       (provider, label, api_key_enc, secret_key_enc, api_key_length, secret_key_length, base_url, is_active)
     VALUES ('steadfast', ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, provider, label, api_key_length, secret_key_length, base_url, is_active, created_at, updated_at`,
  )
    .bind(label, apiKeyEnc, secretKeyEnc, apiKey.length, secretKey.length, baseUrl, makeActive ? 1 : 0)
    .first<CourierAccountRow>();

  await audit(c.env, c.get('admin').username, 'courier.account.add', 'courier_account', String(inserted?.id ?? ''), `Added "${label}"${makeActive ? ' and made it active' : ''}`);

  return c.json({ account: publicAccount(inserted as CourierAccountRow) }, 201);
});

/** Renames an account or rotates its keys. Only the fields sent are changed. */
admin.patch('/courier/accounts/:id', async (c) => {
  requireOwner(c);
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT id, label FROM courier_accounts WHERE id = ?')
    .bind(id)
    .first<{ id: number; label: string }>();
  if (!row) notFound('Courier account not found');

  const body = await readJson(c);
  const sets: string[] = ['updated_at = unixepoch()'];
  const binds: unknown[] = [];

  if (body.label !== undefined) {
    sets.push('label = ?');
    binds.push(requireString(body.label, 'label', 60));
  }
  if (body.base_url !== undefined) {
    sets.push('base_url = ?');
    binds.push(optionalString(body.base_url, '', 200).replace(/\/$/, ''));
  }
  if (body.api_key !== undefined) {
    const apiKey = requireString(body.api_key, 'api_key', 200);
    sets.push('api_key_enc = ?', 'api_key_length = ?');
    binds.push(await encryptSecret(secret(c.env), apiKey), apiKey.length);
  }
  if (body.secret_key !== undefined) {
    const secretKey = requireString(body.secret_key, 'secret_key', 200);
    sets.push('secret_key_enc = ?', 'secret_key_length = ?');
    binds.push(await encryptSecret(secret(c.env), secretKey), secretKey.length);
  }

  const updated = await c.env.DB.prepare(
    `UPDATE courier_accounts SET ${sets.join(', ')} WHERE id = ?
     RETURNING id, provider, label, api_key_length, secret_key_length, base_url, is_active, created_at, updated_at`,
  )
    .bind(...binds, id)
    .first<CourierAccountRow>();

  await audit(c.env, c.get('admin').username, 'courier.account.update', 'courier_account', String(id), `Updated "${row.label}"`);

  return c.json({ account: publicAccount(updated as CourierAccountRow) });
});

/** Switches which account every Steadfast call uses. Nothing about already-booked orders changes. */
admin.post('/courier/accounts/:id/activate', async (c) => {
  requireOwner(c);
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT id, label FROM courier_accounts WHERE id = ?')
    .bind(id)
    .first<{ id: number; label: string }>();
  if (!row) notFound('Courier account not found');

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE courier_accounts SET is_active = 0 WHERE provider = 'steadfast'"),
    c.env.DB.prepare('UPDATE courier_accounts SET is_active = 1, updated_at = unixepoch() WHERE id = ?').bind(id),
  ]);

  await audit(c.env, c.get('admin').username, 'courier.account.activate', 'courier_account', String(id), `Made "${row.label}" the active account`);

  return c.json({ ok: true });
});

/** Removes an account. Orders already booked under it keep their own record of what happened — see courier_account_id. */
admin.delete('/courier/accounts/:id', async (c) => {
  requireOwner(c);
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT id, label FROM courier_accounts WHERE id = ?')
    .bind(id)
    .first<{ id: number; label: string }>();
  if (!row) notFound('Courier account not found');

  await c.env.DB.prepare('DELETE FROM courier_accounts WHERE id = ?').bind(id).run();
  await audit(c.env, c.get('admin').username, 'courier.account.remove', 'courier_account', String(id), `Removed "${row.label}"`);

  return c.json({ ok: true });
});

/**
 * Real money Steadfast has paid the shop for delivered COD parcels — not the
 * single running balance figure. See courierPayments() for why this can fail
 * honestly instead of ever showing an invented number.
 */
admin.get('/courier/payments', async (c) => {
  const result = await courierPayments(c.env);
  if (!result.ok) {
    return c.json({ ok: false, error: result.error, payments: [] });
  }
  return c.json({ ok: true, error: '', payments: result.data });
});

/** Books one order with Steadfast. Explicit staff action, never automatic. */
admin.post('/orders/:id/courier', async (c) => {
  const id = Number(c.req.param('id'));

  const order = await c.env.DB.prepare(
    `SELECT id, order_no, status, consignment_id, customer_name, customer_phone,
            address, city, note, payment_method, total
       FROM orders WHERE id = ?`,
  )
    .bind(id)
    .first<
      CourierOrderRow & {
        customer_name: string;
        customer_phone: string;
        address: string;
        city: string;
        note: string;
        payment_method: string;
        total: number;
      }
    >();
  if (!order) notFound('Order not found');

  // Booking twice would put two vans on the road and two charges on the bill.
  if (order.consignment_id) {
    conflict(`This order is already with Steadfast (consignment ${order.consignment_id}).`);
  }
  if (order.status === 'cancelled' || order.status === 'refunded') {
    badRequest(`"${label(order.status)}" orders cannot be sent to the courier.`);
  }

  const { results } = await c.env.DB.prepare('SELECT name, qty FROM order_items WHERE order_id = ?')
    .bind(id)
    .all<{ name: string; qty: number }>();
  const description = (results ?? []).map((line) => `${line.qty} × ${line.name}`).join(', ') || 'Gadgets';

  const booked = await createConsignment(c.env, order, description);
  if (!booked.ok) {
    // The courier refusing a booking is not a bug in this shop, so it is
    // reported as an upstream failure with their wording intact.
    throw new HTTPException(502, { message: booked.error });
  }

  const cod = codAmountFor(order);
  const accountId = await activeCourierAccountId(c.env);
  await c.env.DB.prepare(
    `UPDATE orders
        SET courier = 'steadfast', consignment_id = ?, tracking_code = ?, courier_status = ?,
            courier_cod_amount = ?, courier_synced_at = strftime('%s','now'), courier_account_id = ?
      WHERE id = ?`,
  )
    .bind(
      String(booked.data.consignment_id),
      booked.data.tracking_code ?? '',
      booked.data.status ?? 'pending',
      cod,
      accountId,
      id,
    )
    .run();

  await audit(
    c.env,
    c.get('admin').username,
    'order.courier.book',
    'order',
    id,
    `${order.order_no} sent to Steadfast — consignment ${booked.data.consignment_id}, COD ৳${(cod / 100).toFixed(2)}`,
  );

  const moved = await applyCourierCheckpoint(c.env, order, booked.data.status ?? 'pending', c.get('admin').username);

  return c.json({
    consignment_id: String(booked.data.consignment_id),
    tracking_code: booked.data.tracking_code ?? '',
    courier_status: booked.data.status ?? 'pending',
    courier_status_label: courierLabel(booked.data.status ?? 'pending'),
    cod_amount: cod,
    moved_to: moved,
  });
});

/** Refreshes one order from the courier. */
admin.post('/orders/:id/courier/sync', async (c) => {
  const id = Number(c.req.param('id'));
  const order = await c.env.DB.prepare('SELECT id, order_no, status, consignment_id FROM orders WHERE id = ?')
    .bind(id)
    .first<CourierOrderRow>();
  if (!order) notFound('Order not found');
  if (!order.consignment_id) badRequest('This order has not been sent to Steadfast yet.');

  const result = await syncOrderFromCourier(c.env, order, c.get('admin').username);
  if (result.error) throw new HTTPException(502, { message: result.error });
  return c.json(result);
});

/**
 * Refreshes every parcel still in flight.
 *
 * Bounded on purpose. A Worker gets a limited number of outbound requests per
 * invocation, so this takes the oldest un-settled parcels a batch at a time
 * rather than trying to walk the whole history and dying halfway.
 */
admin.post('/courier/sync', async (c) => {
  if (!(await courierConfigured(c.env))) badRequest('Steadfast is not connected.');

  const { results } = await c.env.DB.prepare(
    `SELECT id, order_no, status, consignment_id
       FROM orders
      WHERE consignment_id <> ''
        AND status NOT IN ('delivered', 'refunded', 'cancelled')
      ORDER BY courier_synced_at IS NOT NULL, courier_synced_at ASC, id ASC
      LIMIT 20`,
  ).all<CourierOrderRow>();

  const pending = results ?? [];
  const synced: SyncResult[] = [];

  // Four at a time: fast enough to feel instant on a normal day's orders,
  // slow enough to stay well inside the Worker's subrequest allowance.
  for (let i = 0; i < pending.length; i += 4) {
    const batch = pending.slice(i, i + 4);
    synced.push(...(await Promise.all(batch.map((order) => syncOrderFromCourier(c.env, order, c.get('admin').username)))));
  }

  return c.json({
    checked: synced.length,
    moved: synced.filter((entry) => entry.moved_to).length,
    failed: synced.filter((entry) => entry.error).length,
    results: synced,
  });
});

/* ══════════════════════════ customer ratings ══════════════════════════
 *
 * Staff cannot write a rating — only hide one. That is the whole point of
 * tying ratings to delivered orders: a shop that can add its own five-star
 * reviews has ratings worth nothing, and a shop that can quietly delete the
 * bad ones is not far behind. Hiding keeps the row, so the decision is
 * reversible and visible in the audit log.
 */

admin.get('/reviews', async (c) => {
  const url = new URL(c.req.url);
  const onlyHidden = url.searchParams.get('hidden') === '1';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);

  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.rating, r.comment, r.customer_name, r.customer_phone, r.visible, r.created_at,
            p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
            o.order_no
       FROM reviews r
       JOIN products p ON p.id = r.product_id
       LEFT JOIN orders o ON o.id = r.order_id
      WHERE r.visible = ?
      ORDER BY r.created_at DESC
      LIMIT ?`,
  )
    .bind(onlyHidden ? 0 : 1, limit)
    .all();

  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(ROUND(AVG(CASE WHEN visible = 1 THEN rating END), 2), 0) AS average,
            SUM(CASE WHEN visible = 0 THEN 1 ELSE 0 END) AS hidden
       FROM reviews`,
  ).first<{ total: number; average: number; hidden: number }>();

  return c.json({ reviews: results ?? [], totals: totals ?? { total: 0, average: 0, hidden: 0 } });
});

/** Show or hide one rating. The triggers re-derive the product average either way. */
admin.patch('/reviews/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c);
  if (body.visible === undefined) badRequest('Provide "visible"');

  const existing = await c.env.DB.prepare(
    'SELECT r.id, r.rating, p.name FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.id = ?',
  )
    .bind(id)
    .first<{ id: number; rating: number; name: string }>();
  if (!existing) notFound('Review not found');

  const visible = body.visible ? 1 : 0;
  await c.env.DB.prepare('UPDATE reviews SET visible = ? WHERE id = ?').bind(visible, id).run();

  await audit(
    c.env,
    c.get('admin').username,
    'review.visibility',
    'review',
    id,
    `${existing.rating}★ on ${existing.name} → ${visible ? 'shown' : 'hidden'}`,
  );

  return c.json({ ok: true, visible: visible === 1 });
});

/* ══════════════════════════ notifications ══════════════════════════
 *
 * Deliberately not a stored, dismissable log — a count that has to be marked
 * read can drift from reality ("it still says 3 but I confirmed all of
 * them"). This instead recomputes what actually still needs attention on
 * every request, so the bell can never say something that isn't true right
 * now.
 */

interface Notification {
  kind: string;
  count: number;
  label: string;
  href: string;
}

admin.get('/notifications', async (c) => {
  const [pending, lowStock, outOfStock, lowRatings] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'").first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active' AND stock_state = 'low'").first<{
      n: number;
    }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active' AND stock_state = 'out'").first<{
      n: number;
    }>(),
    c.env.DB
      .prepare(
        "SELECT COUNT(*) AS n FROM reviews WHERE visible = 1 AND rating <= 2 AND created_at >= strftime('%s','now','-14 days')",
      )
      .first<{ n: number }>(),
  ]);

  const items: Notification[] = [];
  const push = (n: number | undefined, kind: string, label: (n: number) => string, href: string) => {
    if ((n ?? 0) > 0) items.push({ kind, count: n!, label: label(n!), href });
  };

  push(pending?.n, 'orders_pending', (n) => `${n} order${n === 1 ? '' : 's'} waiting to be confirmed`, '/admin/orders?status=pending');
  push(outOfStock?.n, 'out_of_stock', (n) => `${n} product${n === 1 ? '' : 's'} out of stock`, '/admin/inventory');
  push(lowStock?.n, 'low_stock', (n) => `${n} product${n === 1 ? '' : 's'} running low`, '/admin/inventory');
  push(lowRatings?.n, 'low_ratings', (n) => `${n} low rating${n === 1 ? '' : 's'} in the last 2 weeks`, '/admin/reviews');

  return c.json({ items, total: items.reduce((sum, i) => sum + i.count, 0) });
});

/* ══════════════════════════ Google Analytics / Search Console ══════════════════════════
 *
 * Read-only reporting, pulled with a Google service account instead of a
 * developer having to sign into GA4 to check anything. What the account can
 * see is decided entirely inside GA4 and Search Console, by whichever access
 * the owner granted its email — this Worker only holds the key that proves
 * which account is asking.
 */

async function settingValue(env: Env, key: string): Promise<string> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? '';
}

admin.get('/google/status', async (c) => {
  return c.json({
    connected: googleConfigured(c.env),
    service_account_email: googleServiceAccountEmail(c.env),
    ga4_property_id: await settingValue(c.env, 'ga4_property_id'),
    gsc_site_url: await settingValue(c.env, 'gsc_site_url'),
  });
});

admin.get('/google/ga4/properties', async (c) => {
  const result = await listGa4Properties(c.env);
  if (!result.ok) return c.json({ ok: false, error: result.error, properties: [] });
  return c.json({ ok: true, error: '', properties: result.data });
});

admin.get('/google/ga4/summary', async (c) => {
  const property = await settingValue(c.env, 'ga4_property_id');
  if (!property) {
    return c.json({ ok: false, error: 'No GA4 property selected yet — pick one below.', summary: null });
  }
  const days = Math.min(Math.max(Number(new URL(c.req.url).searchParams.get('days')) || 7, 1), 90);
  const result = await ga4Summary(c.env, property, days);
  if (!result.ok) return c.json({ ok: false, error: result.error, summary: null });
  return c.json({ ok: true, error: '', summary: result.data });
});

admin.get('/google/gsc/sites', async (c) => {
  const result = await listSearchConsoleSites(c.env);
  if (!result.ok) return c.json({ ok: false, error: result.error, sites: [] });
  return c.json({ ok: true, error: '', sites: result.data });
});

// The public container ID pasted into web/index.html's own GTM snippet —
// fixed to the one container this site actually runs, not user-selectable,
// since there is only ever one right answer for "the container on our site".
const GTM_PUBLIC_ID = 'GTM-MGQ6S4HX';

admin.get('/google/gtm/summary', async (c) => {
  const result = await gtmSummary(c.env, GTM_PUBLIC_ID);
  if (!result.ok) return c.json({ ok: false, error: result.error, summary: null });
  return c.json({ ok: true, error: '', summary: result.data });
});

admin.get('/google/gsc/summary', async (c) => {
  const site = await settingValue(c.env, 'gsc_site_url');
  if (!site) {
    return c.json({ ok: false, error: 'No Search Console site selected yet — pick one below.', summary: null });
  }
  const days = Math.min(Math.max(Number(new URL(c.req.url).searchParams.get('days')) || 28, 1), 90);
  const result = await searchConsoleSummary(c.env, site, days);
  if (!result.ok) return c.json({ ok: false, error: result.error, summary: null });
  return c.json({ ok: true, error: '', summary: result.data });
});

admin.get('/google/sheets/status', async (c) => {
  const [id, syncedAt, lastError] = await Promise.all([
    settingValue(c.env, 'sheets_spreadsheet_id'),
    settingValue(c.env, 'sheets_last_synced_at'),
    settingValue(c.env, 'sheets_last_error'),
  ]);
  return c.json({
    spreadsheet_id: id ? parseSpreadsheetId(id) : '',
    last_synced_at: syncedAt ? Number(syncedAt) : null,
    last_error: lastError,
  });
});

/** Saves which spreadsheet to sync into. Accepts either the full URL or a bare ID — whatever was pasted. */
admin.post('/google/sheets/connect', async (c) => {
  requireOwner(c);
  const body = await readJson(c);
  const url = requireString(body.url, 'url', 300);
  const id = parseSpreadsheetId(url);
  if (!id) badRequest('That does not look like a Google Sheets link or ID.');

  await c.env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('sheets_spreadsheet_id', ?, strftime('%s','now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(id!)
    .run();

  await audit(c.env, c.get('admin').username, 'sheets.connect', 'settings', '', `Connected spreadsheet ${id}`);
  return c.json({ ok: true, spreadsheet_id: id });
});

/** Runs the sync immediately, rather than waiting for the hourly cron. */
admin.post('/google/sheets/sync', async (c) => {
  const result = await runSheetsSync(c.env);
  return c.json(result);
});
