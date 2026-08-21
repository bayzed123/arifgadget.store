/**
 * The daily site health check — runs once a day from the Worker's cron (see
 * index.ts / wrangler.toml), gathers real signals from D1 and, if a
 * `site_url` setting has been filled in under Settings, a couple of live
 * fetches against the actual deployed storefront. Those signals (never
 * anything invented) go to Gemini (ALERT_GEMINI_API_KEY) to turn into one
 * short, readable verdict — the same "never fabricate, surface the real
 * thing" rule as every other integration in this codebase, just applied to
 * writing a summary instead of to a number.
 *
 * The result is persisted to settings (site_health_status/summary/checked_at)
 * so the dashboard can show it, and so /admin/notifications can surface it
 * as a bell notification without re-running anything.
 */

import type { Env } from '../types';
import { geminiGenerate, geminiConfigured } from './gemini';
import { courierConfigured, courierBalance } from './steadfast';
import { googleConfigured } from './googleAuth';

export type HealthStatus = 'ok' | 'warning' | 'error';

export interface HealthCheckResult {
  ok: boolean;
  status: HealthStatus | null;
  summary: string;
  error: string;
  checked_at: number | null;
}

async function settingValue(env: Env, key: string): Promise<string> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? '';
}

async function saveSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%s','now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(key, value.slice(0, 1500))
    .run();
}

/** A couple of real HTTP checks against the live, deployed storefront — only run if the owner has told us its URL. */
async function liveSiteChecks(siteUrl: string): Promise<Record<string, string>> {
  const checks: Record<string, string> = {};
  const targets: [string, string][] = [
    ['homepage', siteUrl],
    ['sitemap', `${siteUrl.replace(/\/$/, '')}/sitemap.xml`],
    ['robots', `${siteUrl.replace(/\/$/, '')}/robots.txt`],
  ];
  for (const [name, url] of targets) {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
      checks[name] = `HTTP ${res.status}`;
    } catch (err) {
      checks[name] = `unreachable — ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return checks;
}

async function gatherSignals(env: Env): Promise<Record<string, unknown>> {
  const [
    stuckPending,
    stuckConfirmed,
    outOfStock,
    lowStock,
    lowRatings,
    sheetsError,
    siteUrl,
    apiHealth,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending' AND created_at < strftime('%s','now','-24 hours')").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'confirmed' AND created_at < strftime('%s','now','-48 hours')").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active' AND stock_state = 'out'").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active' AND stock_state = 'low'").first<{ n: number }>(),
    env.DB
      .prepare("SELECT COUNT(*) AS n FROM reviews WHERE visible = 1 AND rating <= 2 AND created_at >= strftime('%s','now','-3 days')")
      .first<{ n: number }>(),
    settingValue(env, 'sheets_last_error'),
    settingValue(env, 'site_url'),
    env.DB.prepare('SELECT COUNT(*) AS n FROM products').first<{ n: number }>(),
  ]);

  const courierOn = await courierConfigured(env);
  const courier: Record<string, unknown> = { configured: courierOn };
  if (courierOn) {
    const balance = await courierBalance(env);
    courier.balance = balance.ok ? `৳${Math.round(balance.data / 100).toLocaleString('en-US')}` : `could not check — ${balance.error}`;
  }

  const signals: Record<string, unknown> = {
    orders_pending_over_24h: stuckPending?.n ?? 0,
    orders_confirmed_not_shipped_over_48h: stuckConfirmed?.n ?? 0,
    products_out_of_stock: outOfStock?.n ?? 0,
    products_low_stock: lowStock?.n ?? 0,
    low_ratings_last_3_days: lowRatings?.n ?? 0,
    database_reachable: (apiHealth?.n ?? 0) >= 0,
    total_products_in_catalog: apiHealth?.n ?? 0,
    google_analytics_integration_configured: googleConfigured(env),
    google_sheets_sync_last_error: sheetsError || null,
    courier,
  };

  if (siteUrl) {
    signals.live_site_checks = await liveSiteChecks(siteUrl);
  } else {
    signals.live_site_checks = 'not run — no site_url set in Settings';
  }

  return signals;
}

const RULES = `
You are a site health analyst for Arif Gadgets, a Bangladeshi e-commerce shop. You are given real, current signals about the shop's dashboard and storefront as JSON. Decide, once, whether there is anything today the shop owner should act on.

Rules:
- Base your assessment ONLY on the JSON given — never invent a number, a problem, or a metric that is not in the data.
- If everything looks routine, say so in one short line — do not manufacture busy-work or pad a fine day into a warning.
- If something needs attention, state it concretely: what, how many/which, why it matters, and the one concrete next step — most urgent first. Keep it to a few short lines total, not an essay; this is read as a dashboard notification, often on a phone.
- Reply in Bangla and English mixed, in a direct, practical, respectful tone — not corporate.
- End your reply with exactly one of these on its own final line, matching your verdict: [STATUS: ok] nothing needs action today, [STATUS: warning] something should be looked at today but nothing is broken, or [STATUS: error] something appears broken (site unreachable, an integration failing) and needs urgent attention.
`.trim();

function parseStatus(reply: string): { status: HealthStatus; summary: string } {
  const match = reply.match(/\[STATUS:\s*(ok|warning|error)\]/i);
  const status = (match?.[1]?.toLowerCase() as HealthStatus | undefined) ?? 'warning';
  const summary = reply.replace(/\[STATUS:\s*(ok|warning|error)\]\s*$/i, '').trim();
  return { status, summary };
}

export async function runHealthCheck(env: Env): Promise<HealthCheckResult> {
  const now = Math.floor(Date.now() / 1000);

  if (!geminiConfigured(env, 'ALERT_GEMINI_API_KEY')) {
    return { ok: false, status: null, summary: '', error: 'ALERT_GEMINI_API_KEY is not set — the daily health check does not run.', checked_at: null };
  }

  const signals = await gatherSignals(env);
  const result = await geminiGenerate(
    env,
    'ALERT_GEMINI_API_KEY',
    RULES,
    [{ role: 'user', text: `SIGNALS:\n${JSON.stringify(signals, null, 2)}` }],
    { temperature: 0.2, maxOutputTokens: 512 },
  );

  if (!result.ok) {
    await saveSetting(env, 'site_health_error', result.error);
    return { ok: false, status: null, summary: '', error: result.error, checked_at: null };
  }

  const { status, summary } = parseStatus(result.data);
  await Promise.all([
    saveSetting(env, 'site_health_status', status),
    saveSetting(env, 'site_health_summary', summary),
    saveSetting(env, 'site_health_checked_at', String(now)),
  ]);
  await env.DB.prepare("DELETE FROM settings WHERE key = 'site_health_error'").run();

  return { ok: true, status, summary, error: '', checked_at: now };
}
