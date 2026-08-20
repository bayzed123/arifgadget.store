/**
 * The storefront's customer-facing support chat — grounded in real store
 * settings (delivery charges, payment methods, contact channels) and the
 * published policy pages (return/refund/warranty/EMI/pre-order/privacy),
 * pulled fresh from D1 on every message so an answer about, say, the
 * delivery charge is never out of date with what Settings actually says.
 *
 * Deliberately has NO access to individual orders, customer accounts, or
 * product stock/pricing beyond what's public — this is a public,
 * unauthenticated endpoint, so it is grounded only in information that is
 * already public on the site.
 */

import type { Env } from '../types';
import { geminiGenerate, geminiConfigured, type GeminiTurn, type GeminiResult } from './gemini';
import { getPublicSettings } from './catalog';

const RULES = `
You are the customer support chat assistant embedded on the Arif Gadgets website — a Bangladeshi wholesale/retail gadget shop (phones, audio, wearables, power/charging, computing accessories). You talk directly to shoppers and site visitors, not staff.

Rules:
- Answer using the STORE INFO block below — delivery charges and zones, payment methods, the policy pages (return, refund, warranty, EMI/payment, pre-order, privacy, FAQs), contact channels, and what categories the shop carries.
- You do NOT have access to any individual customer's order, account, or payment status. For any order-status question, tell them to open the "Track your order" page (enter the order number and the phone number used to order) — or, if it's urgent, to contact support directly via the WhatsApp/phone number in STORE INFO. Never guess or invent an order status.
- You do NOT have live product prices or stock levels. For a specific product, point them to the search bar or the Catalog page rather than stating a number you don't have.
- Never ask for, or accept, a password, OTP, full card number, or any payment credential. If someone offers one, tell them not to share it here — the shop never asks for that over chat.
- Keep answers short, warm, and genuinely useful — a small shop's front-line support, not a corporate script.
- Reply in whichever language the visitor writes in (Bangla, English, or Banglish) — match their style.
- If a question genuinely needs a human or you are unsure, say so plainly and give the phone/WhatsApp contact from STORE INFO rather than guessing.
`.trim();

interface PageRow {
  title: string;
  summary: string;
  body: string;
}

async function storeContext(env: Env): Promise<string> {
  const settings = await getPublicSettings(env);
  const [categories, pages] = await Promise.all([
    env.DB.prepare('SELECT name FROM categories ORDER BY sort_order ASC').all<{ name: string }>(),
    env.DB.prepare("SELECT title, summary, body FROM pages WHERE published = 1 AND section <> 'hidden' ORDER BY sort_order ASC").all<PageRow>(),
  ]);

  const taka = (poisha: number) => Math.round(poisha / 100).toLocaleString('en-US');

  const lines = [
    `Store: ${settings.store_name || 'Arif Gadgets'}${settings.store_tagline ? ` — ${settings.store_tagline}` : ''}`,
    settings.store_address ? `Address: ${settings.store_address}` : '',
    `Support phone: ${settings.support_phone || 'not published'}${settings.support_phone_2 ? `, ${settings.support_phone_2}` : ''}`,
    settings.support_whatsapp_url ? `WhatsApp: ${settings.support_whatsapp_url}` : '',
    settings.support_email ? `Support email: ${settings.support_email}` : '',
    `Delivery charge: ৳${taka(settings.shipping_dhaka)} inside Dhaka, ৳${taka(settings.shipping_outside)} outside Dhaka` +
      (settings.free_shipping_over > 0 ? `, free above ৳${taka(settings.free_shipping_over)}` : '') +
      '.',
    'Payment methods: Cash on delivery, bKash, Nagad, Rocket, bank transfer.',
    `Categories carried: ${(categories.results ?? []).map((c) => c.name).join(', ') || 'a range of gadgets'}.`,
  ].filter(Boolean);

  const policyText = (pages.results ?? [])
    .map((p) => `### ${p.title}\n${[p.summary, (p.body ?? '').slice(0, 700)].filter(Boolean).join('\n')}`)
    .join('\n\n');

  return `${lines.join('\n')}\n\nPOLICY PAGES (published on the site):\n${policyText || '(none published yet)'}`;
}

export function supportAssistantConfigured(env: Env): boolean {
  return geminiConfigured(env, 'SUPPORT_GEMINI_API_KEY');
}

const MAX_HISTORY = 10;

export async function supportAssistantReply(env: Env, history: GeminiTurn[]): Promise<GeminiResult<string>> {
  const trimmed = history.slice(-MAX_HISTORY);
  const context = await storeContext(env);
  const system = `${RULES}\n\nSTORE INFO:\n${context}`;
  return geminiGenerate(env, 'SUPPORT_GEMINI_API_KEY', system, trimmed, { temperature: 0.5, maxOutputTokens: 512 });
}
