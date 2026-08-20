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
import { decryptSecret } from './crypto';
import type { Env } from '../types';

const DEFAULT_BASE = 'https://portal.packzy.com/api/v1';

/** Courier calls should not be able to hang a dashboard request. */
const TIMEOUT_MS = 12_000;

export type CourierResult<T> =
  | { ok: true; data: T }
  /** `status` is the courier's HTTP code when there was one — it is what tells
   *  a rejected key (401) apart from a portal that is simply down (5xx). */
  | { ok: false; error: string; status?: number };

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
  // Steadfast's status-lookup endpoints document lowercase values ("in_review"),
  // but their webhook's own example payload shows "Delivered" capitalised. Rather
  // than trust either casing, this is compared case-insensitively so a webhook
  // event is never silently ignored over a capital letter.
  switch (status.toLowerCase()) {
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
  /** Which `courier_accounts` row this came from, or null for the legacy deploy-secret account. */
  accountId: number | null;
  /** For messages and the dashboard — never the key itself. */
  label: string;
}

interface AccountRow {
  id: number;
  label: string;
  api_key_enc: string;
  secret_key_enc: string;
  api_key_length: number;
  secret_key_length: number;
  base_url: string;
}

/**
 * Which credentials to use, in order: the account staff have marked active in
 * Settings, then the original single Worker-secret account from the deploy.
 *
 * The fallback matters for every shop that had Steadfast connected before
 * accounts existed in the database at all — nothing breaks and nothing needs
 * re-entering just because this table now exists. Once an account is added
 * from Settings and made active, it takes over from the deploy secret.
 */
async function resolveAccount(env: Env): Promise<Credentials | null> {
  const row = await env.DB.prepare(
    `SELECT id, label, api_key_enc, secret_key_enc, api_key_length, secret_key_length, base_url
       FROM courier_accounts WHERE provider = 'steadfast' AND is_active = 1 LIMIT 1`,
  ).first<AccountRow>();

  if (row) {
    // Decrypting needs JWT_SECRET, which every admin route already depends on
    // to issue and check sessions — if it is missing, staff could not have
    // signed in to add this account in the first place, so this is treated
    // the same as no account being configured rather than a distinct error.
    if (!env.JWT_SECRET) return null;
    const [apiKey, secretKey] = await Promise.all([
      decryptSecret(env.JWT_SECRET, row.api_key_enc),
      decryptSecret(env.JWT_SECRET, row.secret_key_enc),
    ]);
    return {
      apiKey,
      secretKey,
      base: (row.base_url.trim() || DEFAULT_BASE).replace(/\/$/, ''),
      accountId: row.id,
      label: row.label,
    };
  }

  const apiKey = env.STEADFAST_API_KEY?.trim();
  const secretKey = env.STEADFAST_SECRET_KEY?.trim();
  if (!apiKey || !secretKey) return null;
  return {
    apiKey,
    secretKey,
    base: (env.STEADFAST_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, ''),
    accountId: null,
    label: 'Deploy secret',
  };
}

/** True when some account — dashboard-added or the legacy deploy secret — is usable. Lets the UI say "not connected" instead of failing. */
export async function courierConfigured(env: Env): Promise<boolean> {
  return (await resolveAccount(env)) !== null;
}

/**
 * What the dashboard is allowed to know about the active credentials.
 *
 * Which keys exist and how long they are — never a character of their value.
 * The length is what separates "the secret is missing" from "the secret holds
 * the wrong thing", and it was the missing fact that made a rejected key
 * indistinguishable from an unset one. For a dashboard-added account this
 * comes straight from the stored length columns, so checking it never needs
 * to decrypt a key just to report its size.
 */
export async function credentialShape(env: Env): Promise<{
  api_key_present: boolean;
  secret_key_present: boolean;
  api_key_length: number;
  secret_key_length: number;
  base_url: string;
  account_label: string;
  /** Where the active credentials came from — Settings, or the original deploy secret. */
  source: 'dashboard' | 'legacy' | 'none';
}> {
  const row = await env.DB.prepare(
    `SELECT label, api_key_length, secret_key_length, base_url
       FROM courier_accounts WHERE provider = 'steadfast' AND is_active = 1 LIMIT 1`,
  ).first<{ label: string; api_key_length: number; secret_key_length: number; base_url: string }>();

  if (row) {
    return {
      api_key_present: row.api_key_length > 0,
      secret_key_present: row.secret_key_length > 0,
      api_key_length: row.api_key_length,
      secret_key_length: row.secret_key_length,
      base_url: (row.base_url.trim() || DEFAULT_BASE).replace(/\/$/, ''),
      account_label: row.label,
      source: 'dashboard',
    };
  }

  const apiKey = env.STEADFAST_API_KEY?.trim() ?? '';
  const secretKey = env.STEADFAST_SECRET_KEY?.trim() ?? '';
  return {
    api_key_present: apiKey.length > 0,
    secret_key_present: secretKey.length > 0,
    api_key_length: apiKey.length,
    secret_key_length: secretKey.length,
    base_url: (env.STEADFAST_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, ''),
    account_label: apiKey ? 'Deploy secret' : '',
    source: apiKey ? 'legacy' : 'none',
  };
}

/* ─────────────────────────── transport ─────────────────────────── */

async function call<T>(env: Env, path: string, init?: { method: string; body: unknown }): Promise<CourierResult<T>> {
  const creds = await resolveAccount(env);
  if (!creds) {
    return {
      ok: false,
      error: 'Steadfast is not connected. Add an account from Settings → Courier accounts, or set STEADFAST_API_KEY and STEADFAST_SECRET_KEY as Worker secrets.',
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
      // Steadfast's documented responses are all JSON, so a non-JSON body is
      // something in front of their application answering instead — most
      // often their own Cloudflare edge issuing a bot-challenge page, or a
      // plain-text/HTML 401 view for a request their auth middleware never
      // accepted. "Not JSON" alone gave no way to tell those apart, so a
      // short, tag-stripped snippet of the actual body goes into the error —
      // seeing the words "Just a moment" or "Attention Required" is the
      // difference between chasing the wrong fix and the right one.
      const snippet = text
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
      const looksLikeChallenge = /just a moment|attention required|cf-browser-verification|checking your browser/i.test(
        text,
      );
      return {
        ok: false,
        status: res.status,
        error: looksLikeChallenge
          ? `Steadfast's own Cloudflare protection blocked this request with a ${res.status} challenge page, before it reached their API at all.`
          : snippet
            ? `Steadfast replied with ${res.status} and this instead of JSON: "${snippet}${text.length > 160 ? '…' : ''}"`
            : `Steadfast replied with ${res.status} and an empty body.`,
      };
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
        status: typeof body?.status === 'number' ? body.status : res.status,
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

/** Which `courier_accounts` row is currently used to talk to Steadfast, or null for the legacy deploy secret / not connected. */
export async function activeCourierAccountId(env: Env): Promise<number | null> {
  const account = await resolveAccount(env);
  return account?.accountId ?? null;
}

/** One remitted payment — what Steadfast has actually paid the shop for delivered COD parcels. */
export interface CourierPayment {
  reference: string;
  amount: number;
  status: string;
  note: string;
  paidAt: string;
}

/**
 * The COD money Steadfast has actually settled to the shop — real bank
 * deposits, not the single running balance figure. Steadfast's own response
 * shape here has not been confirmed against this shop's live account yet
 * (their public docs describe it, but a payments history is only observable
 * with a real, funded account), so this is deliberately defensive: it accepts
 * several plausible field names and layouts, and if none of them match it
 * fails with the raw keys it actually saw rather than ever showing an invented
 * number. The same "never fabricate, always name the real problem" rule the
 * rest of this file follows for a 401.
 */
export async function courierPayments(env: Env): Promise<CourierResult<CourierPayment[]>> {
  const result = await call<unknown>(env, '/payments');
  if (!result.ok) return result;

  const payload = result.data;
  const rows: unknown[] | null = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data)
      : Array.isArray((payload as { payments?: unknown })?.payments)
        ? ((payload as { payments: unknown[] }).payments)
        : null;

  if (!rows) {
    const keys = payload && typeof payload === 'object' ? Object.keys(payload as object).join(', ') : typeof payload;
    return {
      ok: false,
      error: `Steadfast's payment list came back in a shape this dashboard does not recognise (top-level keys: ${keys || 'none'}). Nothing was invented in its place — this needs checking against a real response.`,
    };
  }

  const payments: CourierPayment[] = rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    const amount = r.amount ?? r.paid_amount ?? r.cod_amount ?? r.total_amount;
    return {
      reference: String(r.invoice ?? r.trx_id ?? r.transaction_id ?? r.reference ?? r.id ?? ''),
      amount: typeof amount === 'number' ? amount : Number(amount) || 0,
      status: String(r.status ?? r.payment_status ?? ''),
      note: String(r.note ?? r.remarks ?? ''),
      paidAt: String(r.paid_at ?? r.payment_date ?? r.created_at ?? r.date ?? ''),
    };
  });

  return { ok: true, data: payments };
}
