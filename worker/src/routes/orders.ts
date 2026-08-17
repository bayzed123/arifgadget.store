import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { badRequest, conflict, notFound, optionalString, readJson, requireString } from '../lib/http';
import { getSettings, loadTiers } from '../lib/catalog';
import { computeCart, parseZone, type CartLineInput, type CartTotals, type DeliveryZone } from '../lib/pricing';
import { currentCustomer } from './account';
import { digitsSql, normalisePhone, phoneVariants } from '../lib/phone';

interface IncomingItem {
  product_id: number;
  qty: number;
}

interface PricedProduct {
  id: number;
  sku: string;
  name: string;
  image_url: string;
  price: number;
  cost_price: number;
  moq: number;
  stock: number;
}

export const orders = new Hono<{ Bindings: Env; Variables: Variables }>();

function parseItems(raw: unknown): IncomingItem[] {
  if (!Array.isArray(raw) || raw.length === 0) badRequest('"items" must be a non-empty array');
  if (raw.length > 50) badRequest('An order may contain at most 50 distinct products');

  const seen = new Set<number>();
  return raw.map((entry) => {
    if (typeof entry !== 'object' || entry === null) badRequest('Each item must be an object');
    const item = entry as Record<string, unknown>;
    const product_id = Number(item.product_id);
    const qty = Number(item.qty);
    if (!Number.isInteger(product_id) || product_id <= 0) badRequest('Each item needs a valid "product_id"');
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100_000) badRequest('Each item needs a "qty" between 1 and 100000');
    if (seen.has(product_id)) badRequest(`Duplicate product_id ${product_id} — merge the quantities`);
    seen.add(product_id);
    return { product_id, qty };
  });
}

/** Loads the requested products and prices the cart through the tier engine. */
async function priceCart(env: Env, items: IncomingItem[], zone: DeliveryZone = 'outside') {
  const placeholders = items.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT id, sku, name, image_url, price, cost_price, moq, stock
       FROM products WHERE id IN (${placeholders}) AND status = 'active'`,
  )
    .bind(...items.map((i) => i.product_id))
    .all<PricedProduct>();

  const byId = new Map((results ?? []).map((p) => [p.id, p]));
  const missing = items.filter((i) => !byId.has(i.product_id));
  if (missing.length) {
    badRequest(`These products are unavailable: ${missing.map((m) => m.product_id).join(', ')}`);
  }

  const tiers = await loadTiers(env, items.map((i) => i.product_id));
  const settings = await getSettings(env);

  const inputs: CartLineInput[] = items.map((item) => {
    const product = byId.get(item.product_id)!;
    return {
      product_id: product.id,
      qty: item.qty,
      base_price: product.price,
      cost_price: product.cost_price,
      moq: product.moq,
      tiers: tiers.get(product.id) ?? [],
    };
  });

  return { totals: computeCart(inputs, settings, 0, zone), byId, settings };
}

/** Public totals never leak cost price, profit or margin. */
function publicTotals(totals: CartTotals, byId: Map<number, PricedProduct>) {
  return {
    lines: totals.lines.map((line) => {
      const product = byId.get(line.product_id)!;
      return {
        product_id: line.product_id,
        sku: product.sku,
        name: product.name,
        image_url: product.image_url,
        qty: line.qty,
        moq: product.moq,
        unit_price: line.unit_price,
        line_total: line.line_total,
        tier_savings: line.tier_savings,
        stock: product.stock,
        in_stock: product.stock >= line.qty,
      };
    }),
    subtotal: totals.subtotal,
    tier_savings: totals.tier_savings,
    discount: totals.discount,
    shipping: totals.shipping,
    tax: totals.tax,
    total: totals.total,
    units: totals.units,
    delivery_zone: totals.delivery_zone,
    free_shipping_applied: totals.free_shipping_applied,
    free_shipping_gap: totals.free_shipping_gap,
  };
}

/** Live cart pricing — the storefront calls this on every quantity change. */
orders.post('/quote', async (c) => {
  const body = await readJson(c);
  const items = parseItems(body.items);
  const { totals, byId } = await priceCart(c.env, items, parseZone(body.delivery_zone));
  return c.json(publicTotals(totals, byId));
});

orders.post('/orders', async (c) => {
  const body = await readJson(c);
  const items = parseItems(body.items);

  const customer_name = requireString(body.customer_name, 'customer_name', 120);
  // Stored canonically (01XXXXXXXXX) so tracking, the dashboard and account
  // adoption all compare the same string later.
  const customer_phone = normalisePhone(requireString(body.customer_phone, 'customer_phone', 32));
  const customer_email = optionalString(body.customer_email, '', 160);
  const address = requireString(body.address, 'address', 400);
  const city = requireString(body.city, 'city', 80);
  const note = optionalString(body.note, '', 500);
  // bKash/Nagad/Rocket TrxID or a bank reference — the shopper's proof of payment.
  const payment_reference = optionalString(body.payment_reference, '', 80);
  const payment_method = ['cod', 'bkash', 'nagad', 'rocket', 'bank'].includes(String(body.payment_method))
    ? String(body.payment_method)
    : 'cod';

  const delivery_zone = parseZone(body.delivery_zone);
  const { totals, byId } = await priceCart(c.env, items, delivery_zone);

  const short = totals.lines.filter((line) => byId.get(line.product_id)!.stock < line.qty);
  if (short.length) {
    conflict(
      `Not enough stock for: ${short
        .map((l) => `${byId.get(l.product_id)!.name} (${byId.get(l.product_id)!.stock} left)`)
        .join(', ')}`,
    );
  }

  // A signed-in shopper gets the order filed against their account so it shows
  // up in their order history; guest checkout stays supported.
  const customer = await currentCustomer(c);

  const orderNo = `AG${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0')}`;

  // One batch = one transaction. If any line trips the stock >= 0 constraint
  // (a concurrent order emptied the shelf) the whole order rolls back.
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO orders (order_no, customer_name, customer_phone, customer_email, address, city,
                           note, payment_method, status, discount, shipping, tax, customer_id,
                           delivery_zone, payment_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      orderNo,
      customer_name,
      customer_phone,
      customer_email,
      address,
      city,
      note,
      payment_method,
      totals.discount,
      totals.shipping,
      totals.tax,
      customer?.sub ?? null,
      delivery_zone,
      payment_reference,
    ),
    ...totals.lines.map((line) => {
      const product = byId.get(line.product_id)!;
      return c.env.DB.prepare(
        `INSERT INTO order_items (order_id, product_id, sku, name, image_url, qty, unit_price, unit_cost)
         SELECT id, ?, ?, ?, ?, ?, ?, ? FROM orders WHERE order_no = ?`,
      ).bind(
        product.id,
        product.sku,
        product.name,
        product.image_url,
        line.qty,
        line.unit_price,
        line.unit_cost,
        orderNo,
      );
    }),
  ];

  try {
    await c.env.DB.batch(statements);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/CHECK constraint/i.test(message)) {
      conflict('Someone just bought the last of one of these items. Refresh your cart and try again.');
    }
    throw err;
  }

  const created = await c.env.DB.prepare(
    `SELECT order_no, status, subtotal, discount, shipping, tax, total, created_at
       FROM orders WHERE order_no = ?`,
  )
    .bind(orderNo)
    .first();

  return c.json({ order: created, items: publicTotals(totals, byId).lines }, 201);
});

/**
 * Order tracking. The phone number on the order acts as the shared secret, so
 * it has to match however the shopper typed it — at checkout and here. Orders
 * placed before numbers were normalised are stored as +8801…, which an exact
 * comparison would never find, hence the digits-only match on both sides.
 */
orders.get('/orders/:orderNo', async (c) => {
  const orderNo = c.req.param('orderNo').trim().toUpperCase();
  const rawPhone = new URL(c.req.url).searchParams.get('phone')?.trim();
  if (!rawPhone) badRequest('Add ?phone= the number used on the order');

  const variants = phoneVariants(normalisePhone(rawPhone));
  const placeholders = variants.map(() => '?').join(', ');

  const order = await c.env.DB.prepare(
    `SELECT order_no, customer_name, customer_phone, address, city, note, status,
            subtotal, discount, shipping, tax, total,
            payment_method, payment_reference, delivery_zone, created_at, updated_at
       FROM orders
      WHERE upper(order_no) = ?
        AND ${digitsSql('customer_phone')} IN (${placeholders})`,
  )
    .bind(orderNo, ...variants)
    .first<{ order_no: string }>();

  if (!order) notFound('No order matches that number and phone');

  const { results } = await c.env.DB.prepare(
    `SELECT oi.sku, oi.name, oi.image_url, oi.qty, oi.unit_price, oi.line_total
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.order_no = ?`,
  )
    .bind(order.order_no)
    .all();

  return c.json({ order, items: results ?? [] });
});
