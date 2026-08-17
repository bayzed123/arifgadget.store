import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { CustomerClaims, Env, Variables } from '../types';
import { badRequest, conflict, notFound, optionalString, readJson, requireString, unauthorized } from '../lib/http';
import { hashPassword, randomSalt, signToken, verifyPassword, verifyToken } from '../lib/auth';
import { digitsSql, normalisePhone, phoneVariants, validPhone } from '../lib/phone';

const SESSION_DAYS = 30;

export const account = new Hono<{ Bindings: Env; Variables: Variables }>();

function secret(env: Env): string {
  if (!env.JWT_SECRET) {
    throw new HTTPException(500, { message: 'JWT_SECRET is not configured' });
  }
  return env.JWT_SECRET;
}

/** Reads the customer session, if one is present. Never throws. */
export async function currentCustomer(c: {
  req: { header: (n: string) => string | undefined };
  env: Env;
}): Promise<CustomerClaims | null> {
  const header = c.req.header('Authorization') ?? '';
  if (!header.startsWith('Bearer ') || !c.env.JWT_SECRET) return null;
  const claims = await verifyToken(header.slice(7), c.env.JWT_SECRET);
  return claims && claims.kind === 'customer' ? claims : null;
}

/** Guards everything except register and login. */
account.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.endsWith('/account/register') || path.endsWith('/account/login')) return next();

  const claims = await currentCustomer(c);
  if (!claims) unauthorized('Sign in to view your account');
  c.set('customer', claims!);
  return next();
});

async function issue(c: { env: Env }, row: { id: number; phone: string; name: string }) {
  const claims: CustomerClaims = {
    kind: 'customer',
    sub: row.id,
    phone: row.phone,
    name: row.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400,
  };
  return { token: await signToken(claims, secret(c.env)), expires_at: claims.exp };
}

account.post('/register', async (c) => {
  const body = await readJson(c);
  const name = requireString(body.name, 'name', 120);
  const phone = normalisePhone(requireString(body.phone, 'phone', 32));
  const password = requireString(body.password, 'password', 200);

  if (!validPhone(phone)) badRequest('Enter a valid Bangladeshi mobile number, e.g. 01712345678');
  if (password.length < 6) badRequest('Password must be at least 6 characters');

  const existing = await c.env.DB.prepare('SELECT id FROM customers WHERE phone = ?').bind(phone).first();
  if (existing) conflict('An account already uses that number. Sign in instead.');

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);

  const row = await c.env.DB.prepare(
    `INSERT INTO customers (phone, name, email, address, city, password_hash, salt)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, phone, name`,
  )
    .bind(
      phone,
      name,
      optionalString(body.email, '', 160),
      optionalString(body.address, '', 400),
      optionalString(body.city, '', 80),
      hash,
      salt,
    )
    .first<{ id: number; phone: string; name: string }>();

  // Adopt any past guest orders placed with this number, including ones saved
  // as +880… before numbers were normalised on the way in.
  const variants = phoneVariants(phone);
  await c.env.DB.prepare(
    `UPDATE orders SET customer_id = ?
      WHERE customer_id IS NULL
        AND ${digitsSql('customer_phone')} IN (${variants.map(() => '?').join(', ')})`,
  )
    .bind(row!.id, ...variants)
    .run();

  const session = await issue(c, row!);
  return c.json({ ...session, customer: { id: row!.id, phone, name } }, 201);
});

account.post('/login', async (c) => {
  const body = await readJson(c);
  const phone = normalisePhone(requireString(body.phone, 'phone', 32));
  const password = requireString(body.password, 'password', 200);

  const row = await c.env.DB.prepare(
    'SELECT id, phone, name, password_hash, salt FROM customers WHERE phone = ?',
  )
    .bind(phone)
    .first<{ id: number; phone: string; name: string; password_hash: string; salt: string }>();

  // Hash regardless so timing doesn't reveal which numbers are registered.
  const ok = row
    ? await verifyPassword(password, row.salt, row.password_hash)
    : (await hashPassword(password, randomSalt()), false);
  if (!row || !ok) unauthorized('Wrong number or password');

  await c.env.DB.prepare("UPDATE customers SET last_login_at = strftime('%s','now') WHERE id = ?")
    .bind(row.id)
    .run();

  const session = await issue(c, row);
  return c.json({ ...session, customer: { id: row.id, phone: row.phone, name: row.name } });
});

account.get('/me', async (c) => {
  const me = c.get('customer');
  const row = await c.env.DB.prepare(
    'SELECT id, phone, name, email, address, city, created_at FROM customers WHERE id = ?',
  )
    .bind(me.sub)
    .first();
  if (!row) unauthorized('Account no longer exists');

  const stats = await c.env.DB.prepare(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS spent
       FROM orders WHERE customer_id = ? AND counts_as_sale = 1`,
  )
    .bind(me.sub)
    .first<{ orders: number; spent: number }>();

  return c.json({ customer: row, stats });
});

account.patch('/me', async (c) => {
  const me = c.get('customer');
  const body = await readJson(c);

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.name !== undefined) {
    sets.push('name = ?');
    binds.push(requireString(body.name, 'name', 120));
  }
  for (const field of ['email', 'address', 'city'] as const) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(optionalString(body[field], '', 400));
    }
  }
  if (!sets.length) badRequest('Nothing to update');

  await c.env.DB.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, me.sub)
    .run();
  return c.json({ ok: true });
});

/** The customer's own orders — no phone needed, the session proves ownership. */
account.get('/orders', async (c) => {
  const me = c.get('customer');
  const { results } = await c.env.DB.prepare(
    `SELECT order_no, status, subtotal, discount, shipping, tax, total,
            payment_method, city, created_at,
            (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = orders.id) AS units
       FROM orders WHERE customer_id = ?
      ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(me.sub)
    .all();
  return c.json({ orders: results ?? [] });
});

account.get('/orders/:orderNo', async (c) => {
  const me = c.get('customer');
  const order = await c.env.DB.prepare(
    `SELECT id, order_no, customer_name, city, address, status, subtotal, discount, shipping,
            tax, total, payment_method, created_at, updated_at
       FROM orders WHERE order_no = ? AND customer_id = ?`,
  )
    .bind(c.req.param('orderNo'), me.sub)
    .first<{ id: number }>();
  if (!order) notFound('Order not found on this account');

  const { results } = await c.env.DB.prepare(
    'SELECT sku, name, image_url, qty, unit_price, line_total FROM order_items WHERE order_id = ?',
  )
    .bind(order.id)
    .all();

  return c.json({ order, items: results ?? [] });
});
