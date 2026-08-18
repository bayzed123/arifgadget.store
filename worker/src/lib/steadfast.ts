/**
 * Steadfast Courier integration.
 *
 * The shop delivers through Steadfast, so the courier is the authority on
 * whether a parcel arrived, came back, or is still moving — and on whether the
 * cash on delivery was actually collected. This module is the only place that
 * talks to them.
 *
 * Three rules the whole file obeys:
 *
 *  1. **Credentials live in Worker secrets, never in code or the database.**
 *     They are read from the environment at call time and are never returned to
 *     a caller, logged, or echoed in an error message.
 *  2. **Steadfast counts in taka, this codebase counts in poisha.** Every
 *     amount crossing this boundary is converted explicitly. Sending 354000
 *     where 3540 was meant would ask the courier to collect a hundred times the
 *     order value from the customer.
 *  3. **An unreachable courier is not an outage.** Every call returns a result
 *     object rather than throwing, so a failed sync degrades the courier panel
 *     instead of taking down the dashboard.
 */

import { normalisePhone } from './phone';
import type { Env } from '../types';

const DEFAULT_BASE = 'https://portal.packzy.com/api/v1';

/** Courier calls should not be able to hang a dashboard request. */
const TIMEOUT_MS = 12_000;

export type CourierResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Steadfast's own vocabulary. Wider than this shop's six checkpoints, and
 * stored verbatim on the order so the detail survives.
 *
 * The `_approval` variants mean the courier has recorded an outcome that their
 * accounts team has not signed off yet — the parcel's fate is decided, the
 * money is not.
 */
export type SteadfastStatus =
  | 'pending'
  | 'in_review'
  | 'hold'
  | 'delivered_approval'
  | 'partial_delivered_approval'
  | 'cancelled_approval'
  | 'unknown_approval'
  | 'delivered'
  | 'partial_delivered'
  | 'cancelled'
  | 'unknown';

/** Human wording for the dashboard, so staff never see a raw enum. */
export const COURIER_LABELS: Record<string, string> = {
  pending: 'With courier',
  in_review: 'In review',
  hold: 'On hold',
  delivered_approval: 'Delivered — awaiting courier approval',
  partial_delivered_approval: 'Partly delivered — awaiting approval',
  cancelled_approval: 'Returned — awaiting courier approval',
  unknown_approval: 'Unknown — awaiting approval',
  delivered: 'Delivered',
  partial_delivered: 'Partly delivered',
  cancelled: 'Returned to shop',
  unknown: 'Unknown',
};

export const courierLabel = (status: string): string => COURIER_LABELS[status] ?? status;

/**
 * Which of the shop's checkpoints a courier status justifies moving an order
 * to, or null to leave the order where it is.
 *
 * Only outcomes the courier has *approved* move the order. An `_approval`
 * status means the outcome is not final on their side yet, and moving an order
 * to Delivered or Returned early would recognise revenue or restock inventory
 * on a decision that can still be reversed. Those are shown in the dashboard
 * and left alone.
 *
 * `partial_delivered` deliberately does not map either: some units arrived and
 * some did not, which needs a person to decide what was actually sold before
 * stock and profit can be right.
 */
export function checkpointFor(status: string): 'shipped' | 'delivered' | 'refunded' | null {
  switch (status) {
    case 'pending':
    case 'in_review':
    case 'hold':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'refunded';
    default:
      return null;
  }
}

/* ─────────────────────────── configuration ─────────────────────────── */

interface Credentials {
  apiKey: string;
  secretKey: string;
  base: string;
}

function credentials(env: Env): Credentials | null {
  const apiKey = env.STEADFAST_API_KEY?.trim();
  const secretKey = env.STEADFAST_SECRET_KEY?.trim();
  if (!apiKey || !secretKey) return null;
  return { apiKey, secretKey, base: (env.STEADFAST_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, '') };
}

/** True when the Worker has both keys. Lets the UI say "not connected" instead of failing. */
export const courierConfigured = (env: Env): boolean => credentials(env) !== null;

/* ─────────────────────────── transport ─────────────────────────── */

async function call<T>(env: Env, path: string, init?: { method: string; body: unknown }): Promise<CourierResult<T>> {
  const creds = credentials(env);
  if (!creds) {
    return {
      ok: false,
      error: 'Steadfast is not connected. Add STEADFAST_API_KEY and STEADFAST_SECRET_KEY as Worker secrets.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${creds.base}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'Api-Key': creds.apiKey,
        'Secret-Key': creds.secretKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      // A courier portal in maintenance answers with an HTML page. Say so
      // plainly rather than pasting markup into the dashboard.
      return { ok: false, error: `Steadfast replied with ${res.status} and something that was not JSON.` };
    }

    const body = payload as { status?: number; message?: string; errors?: Record<string, string[]> } | null;

    if (!res.ok || (typeof body?.status === 'number' && body.status >= 400)) {
      // Field-level validation comes back as { errors: { recipient_phone: [...] } }.
      const fieldErrors = body?.errors
        ? Object.entries(body.errors)
            .map(([field, messages]) => `${field}: ${(messages ?? []).join(', ')}`)
            .join('; ')
        : '';
      return {
        ok: false,
        error: fieldErrors || body?.message || `Steadfast returned ${res.status}.`,
      };
    }

    return { ok: true, data: payload as T };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      error: aborted ? 'Steadfast did not answer within 12 seconds.' : 'Could not reach Steadfast.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────── money ─────────────────────────── */

/**
 * Poisha → taka for the courier. Steadfast collects what this number says, so
 * it is rounded to two decimals and never allowed to be negative.
 */
export const codTaka = (poisha: number): number => Math.max(0, Math.round(poisha)) / 100;

/**
 * What the courier should collect on delivery.
 *
 * Only cash-on-delivery orders carry a COD amount. An order already paid by
 * bKash, Nagad, Rocket or bank transfer books at zero, because asking the
 * courier to collect again would charge the customer twice.
 */
export function codAmountFor(order: { payment_method: string; total: number }): number {
  return order.payment_method === 'cod' ? order.total : 0;
}

/* ─────────────────────────── operations ─────────────────────────── */

export interface Consignment {
  consignment_id: number | string;
  invoice: string;
  tracking_code: string;
  status: string;
  cod_amount?: number;
}

/**
 * Books one parcel. `invoice` is the shop's order number and Steadfast requires
 * it to be unique, which is what stops a double-click booking the same parcel
 * twice — the second attempt is rejected by them rather than by us.
 */
export async function createConsignment(
  env: Env,
  order: {
    order_no: string;
    customer_name: string;
    customer_phone: string;
    address: string;
    city: string;
    note: string;
    payment_method: string;
    total: number;
  },
  itemDescription: string,
): Promise<CourierResult<Consignment>> {
  const phone = normalisePhone(order.customer_phone);
  if (!/^01\d{9}$/.test(phone)) {
    return { ok: false, error: `"${order.customer_phone}" is not an 11-digit Bangladeshi mobile number.` };
  }

  const address = [order.address, order.city].filter(Boolean).join(', ').slice(0, 250);
  if (!address) return { ok: false, error: 'This order has no delivery address.' };

  const result = await call<{ consignment: Consignment }>(env, '/create_order', {
    method: 'POST',
    body: {
      invoice: order.order_no,
      recipient_name: order.customer_name.slice(0, 100),
      recipient_phone: phone,
      recipient_address: address,
      cod_amount: codTaka(codAmountFor(order)),
      note: order.note.slice(0, 250),
      item_description: itemDescription.slice(0, 250),
    },
  });

  if (!result.ok) return result;
  if (!result.data?.consignment) return { ok: false, error: 'Steadfast accepted the request but returned no consignment.' };
  return { ok: true, data: result.data.consignment };
}

/** Latest delivery status for a booked parcel. */
export async function statusByConsignment(env: Env, consignmentId: string): Promise<CourierResult<string>> {
  const result = await call<{ delivery_status?: string }>(env, `/status_by_cid/${encodeURIComponent(consignmentId)}`);
  if (!result.ok) return result;
  const status = result.data?.delivery_status;
  if (!status) return { ok: false, error: 'Steadfast returned no delivery status.' };
  return { ok: true, data: status };
}

/** Same, keyed by the shop's own order number — the fallback when no id was stored. */
export async function statusByInvoice(env: Env, invoice: string): Promise<CourierResult<string>> {
  const result = await call<{ delivery_status?: string }>(env, `/status_by_invoice/${encodeURIComponent(invoice)}`);
  if (!result.ok) return result;
  const status = result.data?.delivery_status;
  if (!status) return { ok: false, error: 'Steadfast returned no delivery status.' };
  return { ok: true, data: status };
}

/**
 * Current courier account balance, in taka. Doubles as the credential check:
 * it is the cheapest call that proves both keys are right, and it books
 * nothing, so the dashboard can offer a "test connection" button that costs
 * the shop no money.
 */
export async function courierBalance(env: Env): Promise<CourierResult<number>> {
  const result = await call<{ current_balance?: number }>(env, '/get_balance');
  if (!result.ok) return result;
  return { ok: true, data: Number(result.data?.current_balance ?? 0) };
}
