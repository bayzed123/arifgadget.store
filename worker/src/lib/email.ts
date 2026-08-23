import type { Env } from '../types';

/**
 * Resend client — a plain fetch to their HTTP API, no SDK needed for one call
 * type. Optional like every other integration in this codebase: without
 * RESEND_API_KEY or ORDER_ALERT_EMAIL set, callers just get { ok: false } and
 * move on — a missing alert email must never fail the checkout it's about.
 */

interface EmailResult {
  ok: boolean;
  error?: string;
}

async function sendAlertEmail(env: Env, opts: { subject: string; text: string }): Promise<EmailResult> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const to = env.ORDER_ALERT_EMAIL?.trim();
  if (!apiKey || !to) return { ok: false, error: 'not configured' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Resend's shared sandbox sender — works with no domain verification.
        // Swap for an address on a verified domain (e.g. alerts@arifgadget.store)
        // once one exists in the Resend account; nothing else here changes.
        from: env.ALERT_EMAIL_FROM?.trim() || 'Arif Gadgets Alerts <onboarding@resend.dev>',
        to: [to],
        subject: opts.subject,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `Resend rejected the email (HTTP ${res.status}): ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Fired once, right after a new order commits. Money fields on `orders` are
 * stored in poisha (taka × 100) throughout this codebase — see web/src/lib/
 * format.ts's money() — so this converts before printing rather than
 * inventing a second convention just for the email body.
 */
export async function sendNewOrderAlert(
  env: Env,
  order: { order_no: string; customer_name: string; customer_phone: string; total: number; item_count: number },
): Promise<EmailResult> {
  const taka = (poisha: number) => `৳${(poisha / 100).toLocaleString('en-US')}`;
  const subject = `New order ${order.order_no} — ${taka(order.total)}`;
  const text = [
    'A new order just came in on Arif Gadgets.',
    '',
    `Order:     ${order.order_no}`,
    `Customer:  ${order.customer_name} (${order.customer_phone})`,
    `Items:     ${order.item_count}`,
    `Total:     ${taka(order.total)}`,
    '',
    'Open the admin dashboard to confirm and process it.',
  ].join('\n');
  return sendAlertEmail(env, { subject, text });
}
