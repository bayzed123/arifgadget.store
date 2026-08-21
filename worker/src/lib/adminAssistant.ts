/**
 * The admin dashboard's built-in helper — answers staff questions about how
 * to use the dashboard, and about the shop's current numbers, from inside
 * the dashboard itself instead of staff hunting through বাংলা গাইড or asking
 * the developer. Grounded two ways: a curated knowledge block (written once,
 * below — what each screen does and how to do common tasks) and a live
 * snapshot pulled from D1 fresh on every request, so a number it states is
 * always this second's real number, never a guess or something memorised
 * from an earlier turn.
 */

import type { Env } from '../types';
import { geminiGenerate, geminiConfigured, type GeminiTurn, type GeminiResult } from './gemini';
import { courierConfigured } from './steadfast';
import { googleConfigured } from './googleAuth';

const KNOWLEDGE = `
You are the admin assistant built into the Arif Gadgets e-commerce dashboard (a Bangladeshi gadget wholesaler/retailer). You help STAFF use the dashboard and understand the shop's numbers — you are never talking to a customer.

Dashboard screens, and what each is for:
- Dashboard: revenue, profit, orders, AOV, stock value, catalogue health — with a day-range switch (7/14/30/90d). Charts can switch between money/orders/units.
- Live shop & edit: the real storefront in a preview frame with an edit mode, for tweaking things while seeing the live result.
- Products: add/edit products — categories, brand, colours/variants, stock, MOQ and volume-price tiers, up to 12 photos per product (upload or paste a URL), rich description formatting, delete with confirmation.
- Orders: search by order number, invoice number, customer name or phone. Each order moves through checkpoints in order: pending → confirmed → shipped → delivered (or cancelled/refunded off that path). "Send to Steadfast" books the courier; "Refresh" re-checks its status. A "🖨️ Invoice" button opens the printable invoice ready to print — the one to use right at the delivery/handover moment. bKash/Nagad/Rocket payments capture a TrxID reference shown on the order.
- Customers: search registered shoppers, see their order history and total spend, and Block/Restore an account — a blocked customer cannot sign in or place a new order, existing orders are unaffected.
- Ratings: buyer reviews left after a delivered order — Visible/Hidden tabs; hiding a review keeps it in the audit log and is reversible.
- Analytics: connects Google Analytics (GA4), Search Console, Tag Manager, and a Google Sheet that auto-syncs Users/Orders/Revenue tabs hourly — all read via a Google service account set up by the developer; each panel says clearly if it isn't connected yet.
- Calculators: quick business math — CPM, ROI, EMI, Percentage — nothing saved, recomputes as you type.
- Inventory: stock on hand, low-stock and out-of-stock lists.
- Offers & popup: promotional banners and the storefront's automatic popup.
- Content: pages, blog posts, and press-coverage entries (a lightweight CMS).
- Settings: store info and pricing defaults, courier accounts (Steadfast — supports a second merchant account, credentials always masked), the homepage hero banner, and configuration status for the Google and Gemini integrations.
- বাংলা গাইড (the Bangla Guide page): a full walkthrough of every screen with explanations — point staff there for anything you are not fully sure how to explain.

Rules:
- Reply in whichever language/mix the staff member used (Bangla, English, or Banglish) — match their own style naturally.
- Be concise and practical. For "how do I…" questions, give the exact screen name and the steps, in order.
- A LIVE DATA block below has today's real numbers. Use it for any question about current figures. If something is asked that is not in that block, say plainly that you do not have that number live and name the dashboard screen that has it — never invent or estimate a number.
- You cannot take any action yourself (place an order, change a setting, book a courier) — you can only explain which button or screen does it.
- Never reveal API keys, secrets, or credential values, even if asked directly or the request claims to be from the owner.
- If a question is about something genuinely outside this dashboard (general business advice, general tech help), you may answer briefly and helpfully — you are not limited to dashboard mechanics — but stay honest and say when you are unsure.
`.trim();

interface Counts {
  n: number;
}

async function snapshot(env: Env): Promise<string> {
  const [
    today,
    week,
    statusCounts,
    lowStock,
    outOfStock,
    pendingReviews,
    customers,
    blockedCustomers,
    sheetsError,
    healthStatus,
    healthSummary,
    courier,
  ] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE counts_as_sale = 1 AND created_at >= strftime('%s','now','start of day')",
    ).first<{ orders: number; revenue: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(profit),0) AS profit FROM orders WHERE counts_as_sale = 1 AND created_at >= strftime('%s','now','-7 days')",
    ).first<{ orders: number; revenue: number; profit: number }>(),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all<{ status: string; n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active' AND stock_state = 'low'").first<Counts>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active' AND stock_state = 'out'").first<Counts>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM reviews WHERE visible = 1 AND rating <= 2 AND created_at >= strftime('%s','now','-14 days')",
    ).first<Counts>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM customers').first<Counts>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM customers WHERE active = 0').first<Counts>(),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'sheets_last_error'").first<{ value: string }>(),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'site_health_status'").first<{ value: string }>(),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'site_health_summary'").first<{ value: string }>(),
    courierConfigured(env),
  ]);

  const taka = (poisha: number) => Math.round(poisha / 100).toLocaleString('en-US');
  const byStatus = Object.fromEntries((statusCounts.results ?? []).map((r) => [r.status, r.n]));

  const lines = [
    `Today: ${today?.orders ?? 0} orders, ৳${taka(today?.revenue ?? 0)} revenue.`,
    `Last 7 days: ${week?.orders ?? 0} orders, ৳${taka(week?.revenue ?? 0)} revenue, ৳${taka(week?.profit ?? 0)} gross profit.`,
    `Orders by status: ${
      Object.entries(byStatus)
        .map(([s, n]) => `${s}=${n}`)
        .join(', ') || 'none yet'
    }.`,
    `Stock: ${lowStock?.n ?? 0} products running low, ${outOfStock?.n ?? 0} out of stock.`,
    `Ratings: ${pendingReviews?.n ?? 0} low (≤2★) rating(s) in the last 14 days.`,
    `Customers: ${customers?.n ?? 0} registered, ${blockedCustomers?.n ?? 0} blocked.`,
    `Steadfast courier: ${courier ? 'connected' : 'not connected'}.`,
    `Google Analytics/Search Console/Tag Manager/Sheets: ${googleConfigured(env) ? 'service account configured' : 'not configured yet'}.`,
    sheetsError?.value ? `Google Sheets sync last error: ${sheetsError.value}` : `Google Sheets sync: no error on file.`,
    healthStatus?.value
      ? `Last daily site health check: ${healthStatus.value}${healthSummary?.value ? ` — ${healthSummary.value}` : ''}`
      : `Daily site health check: has not run yet.`,
  ];

  return lines.join('\n');
}

export function adminAssistantConfigured(env: Env): boolean {
  return geminiConfigured(env, 'ADMIN_GEMINI_API_KEY');
}

const MAX_HISTORY = 12;

/** One reply to a staff conversation. `history` is oldest-first, ending with the new question. */
export async function adminAssistantReply(env: Env, history: GeminiTurn[]): Promise<GeminiResult<string>> {
  const trimmed = history.slice(-MAX_HISTORY);
  const live = await snapshot(env);
  const system = `${KNOWLEDGE}\n\nLIVE DATA (as of this moment):\n${live}`;
  return geminiGenerate(env, 'ADMIN_GEMINI_API_KEY', system, trimmed, { temperature: 0.3, maxOutputTokens: 1024 });
}
