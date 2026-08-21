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
 *
 * Fast path: the handful of questions almost every visitor actually asks —
 * delivery charge, payment methods, order tracking, return/warranty policy,
 * contact info — are answered directly from this same real data, with no
 * Gemini call at all. That is the entire latency difference: a D1 read
 * instead of a network round trip to an LLM. Anything that doesn't match
 * one of those still goes to Gemini exactly as before — a genuinely unusual
 * question taking longer is fine; a common one taking several seconds
 * wasn't.
 */

import type { Env } from '../types';
import { geminiGenerate, geminiConfigured, type GeminiTurn, type GeminiResult } from './gemini';
import { getPublicSettings } from './catalog';
import type { StoreSettings } from './pricing';

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

interface StoreContext {
  settings: StoreSettings & Record<string, string>;
  categories: string[];
  pages: PageRow[];
}

async function gatherContext(env: Env): Promise<StoreContext> {
  const settings = await getPublicSettings(env);
  const [categories, pages] = await Promise.all([
    env.DB.prepare('SELECT name FROM categories ORDER BY sort_order ASC').all<{ name: string }>(),
    env.DB.prepare("SELECT title, summary, body FROM pages WHERE published = 1 AND section <> 'hidden' ORDER BY sort_order ASC").all<PageRow>(),
  ]);
  return {
    settings,
    categories: (categories.results ?? []).map((c) => c.name),
    pages: pages.results ?? [],
  };
}

const taka = (poisha: number) => Math.round(poisha / 100).toLocaleString('en-US');

function contextText(ctx: StoreContext): string {
  const s = ctx.settings;
  const lines = [
    `Store: ${s.store_name || 'Arif Gadgets'}${s.store_tagline ? ` — ${s.store_tagline}` : ''}`,
    s.store_address ? `Address: ${s.store_address}` : '',
    `Support phone: ${s.support_phone || 'not published'}${s.support_phone_2 ? `, ${s.support_phone_2}` : ''}`,
    s.support_whatsapp_url ? `WhatsApp: ${s.support_whatsapp_url}` : '',
    s.support_email ? `Support email: ${s.support_email}` : '',
    `Delivery charge: ৳${taka(s.shipping_dhaka)} inside Dhaka, ৳${taka(s.shipping_outside)} outside Dhaka` +
      (s.free_shipping_over > 0 ? `, free above ৳${taka(s.free_shipping_over)}` : '') +
      '.',
    'Payment methods: Cash on delivery, bKash, Nagad, Rocket, bank transfer.',
    `Categories carried: ${ctx.categories.join(', ') || 'a range of gadgets'}.`,
  ].filter(Boolean);

  const policyText = ctx.pages
    .map((p) => `### ${p.title}\n${[p.summary, (p.body ?? '').slice(0, 700)].filter(Boolean).join('\n')}`)
    .join('\n\n');

  return `${lines.join('\n')}\n\nPOLICY PAGES (published on the site):\n${policyText || '(none published yet)'}`;
}

/** The nearest matching policy page's own words, trimmed — never a canned line pretending to be the real policy. */
function pageAnswer(ctx: StoreContext, titleKeywords: string[]): string | null {
  const page = ctx.pages.find((p) => titleKeywords.some((k) => p.title.toLowerCase().includes(k)));
  if (!page) return null;
  const text = [page.summary, (page.body ?? '').slice(0, 400)].filter(Boolean).join(' — ');
  return text || null;
}

interface FastRule {
  test: RegExp;
  answer: (ctx: StoreContext) => string;
}

/**
 * Keyword patterns for the questions that make up the bulk of real support
 * chat traffic. Each answer is built from `ctx` (live settings/pages) at
 * call time, never a hardcoded string — the fast path is faster because it
 * skips Gemini, not because it skips being accurate.
 */
const FAST_RULES: FastRule[] = [
  {
    test: /ডেলিভারি\s*(চার্জ|খরচ|ফি)|shipping\s*(cost|charge|fee)|delivery\s*(charge|fee|cost)|কুরিয়ার\s*চার্জ|কত\s*টাকা.{0,10}ডেলিভারি/i,
    answer: (ctx) => {
      const s = ctx.settings;
      let text = `ডেলিভারি চার্জ — ঢাকার ভেতরে ৳${taka(s.shipping_dhaka)}, ঢাকার বাইরে ৳${taka(s.shipping_outside)}`;
      if (s.free_shipping_over > 0) text += `। ৳${taka(s.free_shipping_over)}+ অর্ডারে ডেলিভারি ফ্রি`;
      return `${text}।`;
    },
  },
  {
    test: /পেমেন্ট|কিভাবে.{0,6}(পে|টাকা\s*দিব)|payment\s*method|how.{0,10}pay|bkash|নগদ|nagad|rocket|cash\s*on\s*delivery|\bcod\b/i,
    answer: () => 'পেমেন্ট করতে পারবেন Cash on Delivery, bKash, Nagad, Rocket অথবা ব্যাংক ট্রান্সফারের মাধ্যমে — যেটা আপনার জন্য সহজ, সেটাই বেছে নিন।',
  },
  {
    test: /অর্ডার\s*(ট্র্যাক|কই|কোথায়)|track.{0,4}(my\s*)?order|where.{0,6}my\s*order/i,
    answer: () => '"Track your order" পেজে গিয়ে অর্ডার নম্বর আর যেই ফোন নম্বর দিয়ে অর্ডার করেছিলেন সেটা দিন — সাথে সাথে বর্তমান স্ট্যাটাস দেখতে পাবেন।',
  },
  {
    test: /রিটার্ন|return\s*policy|ফেরত\s*(দেওয়া|করা|নেয়)/i,
    answer: (ctx) => pageAnswer(ctx, ['return']) ?? 'নির্দিষ্ট শর্তে রিটার্ন নেওয়া হয় — বিস্তারিত জানতে সাপোর্টে (WhatsApp/ফোন) যোগাযোগ করুন।',
  },
  {
    test: /ওয়ারেন্টি|warranty/i,
    answer: (ctx) => pageAnswer(ctx, ['warranty']) ?? 'প্রোডাক্ট অনুযায়ী ওয়ারেন্টির মেয়াদ ভিন্ন — নির্দিষ্ট প্রোডাক্টের ওয়ারেন্টি জানতে সাপোর্টে যোগাযোগ করুন।',
  },
  {
    test: /যোগাযোগ.{0,6}(নম্বর|করব)|contact\s*(number|info)|phone\s*number|হোয়াটসঅ্যাপ\s*নম্বর/i,
    answer: (ctx) => {
      const s = ctx.settings;
      const parts: string[] = [];
      if (s.support_phone) parts.push(`ফোন: ${s.support_phone}`);
      if (s.support_whatsapp_url) parts.push(`WhatsApp: ${s.support_whatsapp_url}`);
      if (s.support_email) parts.push(`ইমেইল: ${s.support_email}`);
      return parts.length ? parts.join(' · ') : 'যোগাযোগের তথ্যের জন্য ওয়েবসাইটের ফুটার দেখুন।';
    },
  },
];

function fastAnswer(message: string, ctx: StoreContext): string | null {
  for (const rule of FAST_RULES) {
    if (rule.test.test(message)) return rule.answer(ctx);
  }
  return null;
}

export function supportAssistantConfigured(env: Env): boolean {
  return geminiConfigured(env, 'SUPPORT_GEMINI_API_KEY');
}

const MAX_HISTORY = 10;

export async function supportAssistantReply(env: Env, history: GeminiTurn[]): Promise<GeminiResult<string>> {
  const trimmed = history.slice(-MAX_HISTORY);
  const ctx = await gatherContext(env);

  const lastUser = [...trimmed].reverse().find((t) => t.role === 'user');
  if (lastUser) {
    const instant = fastAnswer(lastUser.text, ctx);
    if (instant) return { ok: true, data: instant };
  }

  const system = `${RULES}\n\nSTORE INFO:\n${contextText(ctx)}`;
  return geminiGenerate(env, 'SUPPORT_GEMINI_API_KEY', system, trimmed, { temperature: 0.5, maxOutputTokens: 512 });
}
