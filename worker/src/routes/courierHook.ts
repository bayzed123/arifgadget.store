/**
 * Steadfast delivery webhook — optional.
 *
 * Everything works without this. The dashboard's refresh buttons and the
 * tracking page's own five-minute refresh already keep statuses current, and a
 * shop that never configures a webhook sees no difference except that updates
 * arrive when someone looks rather than the moment they happen.
 *
 * What it buys, when configured, is immediacy: Steadfast posts the moment a
 * parcel is delivered or comes back, so the shopper checking their order sees
 * the truth without waiting for anyone to press anything.
 *
 * **Authentication is the URL itself.** The endpoint carries a secret path
 * segment that must match STEADFAST_WEBHOOK_TOKEN, and the whole route 404s —
 * not 401s — when it does not. A scanner walking the API learns nothing about
 * whether a webhook exists, and Steadfast needs no support for custom headers
 * for this to be safe. Use a long random token; it is a password living in a
 * URL.
 *
 * The payload is read defensively. Couriers rename fields between versions, so
 * every value is looked for under the handful of names it plausibly arrives
 * as, and a shape that carries nothing recognisable is answered 200 with a
 * note rather than an error — a webhook endpoint that returns failures gets
 * disabled by the sender.
 */

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { recordCourierStatus, type CourierOrderRow } from '../lib/courierSync';

export const courierHook = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Reads the first present, non-empty value among several possible field names. */
function pick(body: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = body[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

courierHook.post('/steadfast/:token', async (c) => {
  const expected = c.env.STEADFAST_WEBHOOK_TOKEN?.trim();
  // Unconfigured and wrong-token look identical from outside.
  if (!expected || c.req.param('token') !== expected) return c.notFound();

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ ok: true, note: 'Body was not JSON — nothing to apply.' });
  }

  // Steadfast has used both `status` and `delivery_status` across versions.
  const status = pick(body, 'delivery_status', 'status');
  const consignmentId = pick(body, 'consignment_id', 'consignmentId', 'cid');
  const invoice = pick(body, 'invoice', 'invoice_id', 'order_no');

  if (!status || (!consignmentId && !invoice)) {
    return c.json({ ok: true, note: 'No status or identifier recognised in the payload.' });
  }

  // Matched on the courier's own id first: an invoice is the shop's number and
  // could in principle be reused, a consignment id never is.
  const order = consignmentId
    ? await c.env.DB.prepare('SELECT id, order_no, status, consignment_id FROM orders WHERE consignment_id = ?')
        .bind(consignmentId)
        .first<CourierOrderRow>()
    : await c.env.DB.prepare('SELECT id, order_no, status, consignment_id FROM orders WHERE upper(order_no) = ?')
        .bind(invoice.toUpperCase())
        .first<CourierOrderRow>();

  // An unknown parcel is not an error worth retrying — it is almost always a
  // consignment booked outside this shop, or one whose order has been deleted.
  if (!order) return c.json({ ok: true, note: 'No matching order.' });

  const result = await recordCourierStatus(c.env, order, status, 'steadfast-webhook');
  return c.json({ ok: true, order_no: result.order_no, applied: status, moved_to: result.moved_to ?? null });
});
