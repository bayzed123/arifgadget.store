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
 * **How Steadfast actually authenticates this**, per their own webhook
 * documentation: their merchant portal has two fields when you set this up —
 * a *Callback Url* and an *Auth Token (Bearer)*. The token is not part of the
 * URL; it comes back on every call as `Authorization: Bearer <token>`. So the
 * URL here is fixed and unremarkable, and the secret lives in the header,
 * matched against STEADFAST_WEBHOOK_TOKEN. An unconfigured or mismatched
 * token 404s rather than 401s — a scanner walking the API learns nothing
 * about whether a webhook exists here at all.
 *
 * The payload matches Steadfast's documented shape exactly — two notification
 * types, `delivery_status` and `tracking_update` — with the older
 * guessed-at-alternatives kept as a fallback in case a real payload ever
 * differs from the docs.
 */

import { Hono, type Context } from 'hono';
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

/**
 * The fixed path Steadfast's portal calls "Callback Url". Also accepted at the
 * old `/steadfast/:token` shape some earlier setup may have used — both check
 * the same secret, so nothing that was already configured needs re-entering.
 */
async function handle(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const expected = c.env.STEADFAST_WEBHOOK_TOKEN?.trim();
  if (!expected) return c.notFound();

  const auth = c.req.header('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const pathToken = c.req.param('token'); // present only on the /steadfast/:token variant
  // Unconfigured, wrong header, and wrong path token all look identical from
  // outside — 404, never 401, so nothing here confirms a webhook exists.
  if (bearer !== expected && pathToken !== expected) return c.notFound();

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ status: 'success', message: 'Webhook received successfully.', ok: true, note: 'Body was not JSON — nothing to apply.' });
  }

  const notificationType = pick(body, 'notification_type');
  const consignmentId = pick(body, 'consignment_id', 'consignmentId', 'cid');
  const invoice = pick(body, 'invoice', 'invoice_id', 'order_no');

  // A tracking_update carries a human-readable message but no delivery
  // status — nothing here justifies moving an order's checkpoint. Steadfast
  // still expects a 200, so it is acknowledged rather than ignored.
  if (notificationType === 'tracking_update') {
    return c.json({ status: 'success', message: 'Webhook received successfully.', ok: true, note: 'Tracking update noted; no status to apply.' });
  }

  // delivery_status is the documented type for anything that should move an
  // order, but the field is read regardless of notification_type in case a
  // future Steadfast payload carries a status without labelling itself.
  const status = pick(body, 'status', 'delivery_status');

  if (!status || (!consignmentId && !invoice)) {
    return c.json({ status: 'success', message: 'Webhook received successfully.', ok: true, note: 'No status or identifier recognised in the payload.' });
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
  if (!order) return c.json({ status: 'success', message: 'Webhook received successfully.', ok: true, note: 'No matching order.' });

  const result = await recordCourierStatus(c.env, order, status, 'steadfast-webhook');
  return c.json({
    status: 'success',
    message: 'Webhook received successfully.',
    ok: true,
    order_no: result.order_no,
    applied: status,
    moved_to: result.moved_to ?? null,
  });
}

courierHook.post('/steadfast', handle);
courierHook.post('/steadfast/:token', handle);
