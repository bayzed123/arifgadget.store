/**
 * Customer product ratings.
 *
 * The shop asked for ratings from real buyers, so the right to leave one is
 * earned rather than claimed: a rating is accepted only from a phone number
 * that has a **delivered** order containing that product, and only once per
 * order. Nobody can rate a product they never received, and a competitor with
 * the link can do nothing at all.
 *
 * The same phone-plus-order-number pair that unlocks order tracking is what
 * unlocks rating, so a customer needs nothing new to leave one — no account,
 * no password, no email round trip.
 */

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { badRequest, conflict, notFound, optionalString, readJson, requireInt, requireString } from '../lib/http';
import { digitsSql, normalisePhone, phoneVariants } from '../lib/phone';

export const reviews = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Star counts, so the product page can draw the usual 5-to-1 breakdown. */
interface Summary {
  count: number;
  average: number;
  stars: Record<string, number>;
}

reviews.get('/products/:slug/reviews', async (c) => {
  const slug = c.req.param('slug');
  const product = await c.env.DB.prepare('SELECT id FROM products WHERE slug = ?')
    .bind(slug)
    .first<{ id: number }>();
  if (!product) notFound('Product not found');

  const { results } = await c.env.DB.prepare(
    `SELECT id, customer_name, rating, comment, created_at
       FROM reviews
      WHERE product_id = ? AND visible = 1
      ORDER BY created_at DESC
      LIMIT 50`,
  )
    .bind(product.id)
    .all<{ id: number; customer_name: string; rating: number; comment: string; created_at: number }>();

  const rows = results ?? [];
  const stars: Record<string, number> = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
  for (const row of rows) stars[String(row.rating)] = (stars[String(row.rating)] ?? 0) + 1;

  const summary: Summary = {
    count: rows.length,
    average: rows.length ? Math.round((rows.reduce((sum, r) => sum + r.rating, 0) / rows.length) * 100) / 100 : 0,
    stars,
  };

  return c.json({
    summary,
    // Only a first name goes out. A full name beside a public opinion is more
    // than a shopper agreed to when they bought a charger.
    reviews: rows.map((row) => ({
      id: row.id,
      name: (row.customer_name || 'Customer').split(' ')[0],
      rating: row.rating,
      comment: row.comment,
      created_at: row.created_at,
    })),
  });
});

/**
 * Whether this phone number may rate this product, and on which order.
 *
 * Delivered only. An order still in transit has not been judged yet, and a
 * cancelled or returned one is precisely the case where an angry rating would
 * be about the delivery rather than the product.
 */
async function eligibleOrder(env: Env, productId: number, phone: string, orderNo: string) {
  const variants = phoneVariants(normalisePhone(phone));
  const placeholders = variants.map(() => '?').join(', ');

  return env.DB.prepare(
    `SELECT o.id, o.order_no, o.customer_name, o.status
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
      WHERE upper(o.order_no) = ?
        AND ${digitsSql('o.customer_phone')} IN (${placeholders})
        AND oi.product_id = ?
      LIMIT 1`,
  )
    .bind(orderNo.toUpperCase(), ...variants, productId)
    .first<{ id: number; order_no: string; customer_name: string; status: string }>();
}

/**
 * Tells a shopper whether they can rate, before showing them a form they are
 * not allowed to submit. Same checks as the POST, so the two cannot disagree.
 */
reviews.get('/products/:slug/reviews/eligibility', async (c) => {
  const url = new URL(c.req.url);
  const orderNo = url.searchParams.get('order')?.trim();
  const phone = url.searchParams.get('phone')?.trim();
  if (!orderNo || !phone) badRequest('Add ?order= and ?phone= from your order confirmation');

  const product = await c.env.DB.prepare('SELECT id FROM products WHERE slug = ?')
    .bind(c.req.param('slug'))
    .first<{ id: number }>();
  if (!product) notFound('Product not found');

  const order = await eligibleOrder(c.env, product.id, phone!, orderNo!);
  if (!order) return c.json({ can_rate: false, reason: 'No delivered order of this product matches those details.' });
  if (order.status !== 'delivered') {
    return c.json({ can_rate: false, reason: 'You can rate this once the order has been delivered.' });
  }

  const already = await c.env.DB.prepare(
    'SELECT id FROM reviews WHERE product_id = ? AND order_id = ? LIMIT 1',
  )
    .bind(product.id, order.id)
    .first();

  if (already) return c.json({ can_rate: false, reason: 'You have already rated this product for this order.' });
  return c.json({ can_rate: true, name: order.customer_name });
});

reviews.post('/products/:slug/reviews', async (c) => {
  const body = await readJson(c);
  const orderNo = requireString(body.order_no, 'order_no', 40);
  const phone = requireString(body.phone, 'phone', 20);
  const rating = requireInt(body.rating, 'rating', 1, 5);
  const comment = optionalString(body.comment, '', 600);

  const product = await c.env.DB.prepare('SELECT id FROM products WHERE slug = ?')
    .bind(c.req.param('slug'))
    .first<{ id: number }>();
  if (!product) notFound('Product not found');

  const order = await eligibleOrder(c.env, product.id, phone, orderNo);
  // One message for "no such order" and "wrong phone" alike: a different reply
  // for each would let someone probe order numbers against phone numbers.
  if (!order) badRequest('No order of this product matches that order number and phone.');
  if (order.status !== 'delivered') badRequest('You can rate this once the order has been delivered.');

  try {
    await c.env.DB.prepare(
      `INSERT INTO reviews (product_id, order_id, customer_phone, customer_name, rating, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(product.id, order.id, normalisePhone(phone), order.customer_name, rating, comment)
      .run();
  } catch (err) {
    // The unique index is what actually enforces one rating per purchase.
    if (String(err).includes('UNIQUE')) conflict('You have already rated this product for this order.');
    throw err;
  }

  const updated = await c.env.DB.prepare('SELECT rating, review_count FROM products WHERE id = ?')
    .bind(product.id)
    .first<{ rating: number; review_count: number }>();

  return c.json({ ok: true, rating: updated?.rating ?? rating, review_count: updated?.review_count ?? 1 }, 201);
});
