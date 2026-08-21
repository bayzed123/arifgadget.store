/**
 * The weekly developer/operations report — the one thing in this codebase
 * that looks back over a whole week rather than a single moment. Reads real
 * signals only (order/stock/rating numbers, the error_log and ai_usage_log
 * tables every other part of the Worker already writes to, the existing
 * audit_log of staff actions, and — where connected — GA4, Search Console
 * and Tag Manager), hands them to Gemini (DEVLOPER_REPORT_GEMENI) to turn
 * into one readable report, and appends that report to a Google Doc and two
 * Google Sheets the owner shared with the service account.
 *
 * "Admin staff behaviour" deliberately comes from audit_log, not from
 * sending GA4 events on /admin routes: analytics.ts already excludes every
 * /admin page from the shop's GA4 property on purpose (see its own
 * comment — staff clicking around must never look like shopper behaviour
 * in the numbers the owner uses to judge real traffic). audit_log already
 * is a genuine, existing record of what staff did — no new tracking needed,
 * and the shop's real analytics stay uncontaminated.
 */

import type { Env } from '../types';
import { geminiGenerate, geminiConfigured } from './gemini';
import { googleConfigured } from './googleAuth';
import { ga4Summary } from './googleAnalytics';
import { searchConsoleSummary } from './searchConsole';
import { gtmSummary, GTM_PUBLIC_ID } from './googleTagManager';
import { appendToDocument } from './googleDocs';
import { appendLogRow } from './googleSheets';
import { courierConfigured, courierBalance } from './steadfast';

export type DevReportStatus = 'ok' | 'warning' | 'error';

export interface DevReportResult {
  ok: boolean;
  status: DevReportStatus | null;
  summary: string;
  error: string;
  doc_written: boolean;
  sheet1_written: boolean;
  sheet2_written: boolean;
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
    .bind(key, value.slice(0, 4000))
    .run();
}

interface Row {
  n: number;
}

async function gatherSignals(env: Env): Promise<Record<string, unknown>> {
  const [
    thisWeek,
    priorWeek,
    lowStock,
    outOfStock,
    ratingsThisWeek,
    errorsThisWeek,
    topErrors,
    aiUsage,
    auditByActor,
    auditByAction,
    previousReport,
  ] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(profit),0) AS profit FROM orders WHERE counts_as_sale = 1 AND created_at >= strftime('%s','now','-7 days')",
    ).first<{ orders: number; revenue: number; profit: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE counts_as_sale = 1 AND created_at >= strftime('%s','now','-14 days') AND created_at < strftime('%s','now','-7 days')",
    ).first<{ orders: number; revenue: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active' AND stock_state = 'low'").first<Row>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active' AND stock_state = 'out'").first<Row>(),
    env.DB
      .prepare(
        "SELECT COUNT(*) AS n, COALESCE(AVG(rating),0) AS avg_rating, SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) AS low FROM reviews WHERE visible = 1 AND created_at >= strftime('%s','now','-7 days')",
      )
      .first<{ n: number; avg_rating: number; low: number }>(),
    env.DB
      .prepare(
        "SELECT SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) AS admin_errors, SUM(CASE WHEN is_admin = 0 THEN 1 ELSE 0 END) AS storefront_errors FROM error_log WHERE created_at >= strftime('%s','now','-7 days')",
      )
      .first<{ admin_errors: number | null; storefront_errors: number | null }>(),
    env.DB
      .prepare(
        "SELECT path, message, COUNT(*) AS n FROM error_log WHERE created_at >= strftime('%s','now','-7 days') GROUP BY path, message ORDER BY n DESC LIMIT 8",
      )
      .all<{ path: string; message: string; n: number }>(),
    env.DB
      .prepare(
        "SELECT feature, SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS ok_count, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS error_count FROM ai_usage_log WHERE created_at >= strftime('%s','now','-7 days') GROUP BY feature",
      )
      .all<{ feature: string; ok_count: number; error_count: number }>(),
    env.DB
      .prepare(
        "SELECT actor, COUNT(*) AS n FROM audit_log WHERE created_at >= strftime('%s','now','-7 days') GROUP BY actor ORDER BY n DESC LIMIT 10",
      )
      .all<{ actor: string; n: number }>(),
    env.DB
      .prepare(
        "SELECT action, COUNT(*) AS n FROM audit_log WHERE created_at >= strftime('%s','now','-7 days') GROUP BY action ORDER BY n DESC LIMIT 15",
      )
      .all<{ action: string; n: number }>(),
    env.DB.prepare('SELECT status, summary, created_at FROM dev_reports ORDER BY created_at DESC LIMIT 1').first<{
      status: string;
      summary: string;
      created_at: number;
    }>(),
  ]);

  // Distinct sample error messages, per feature, for real specifics rather
  // than just an error count.
  const aiErrors = await env.DB.prepare(
    "SELECT feature, message FROM (SELECT feature, error AS message, ROW_NUMBER() OVER (PARTITION BY feature ORDER BY created_at DESC) AS rn FROM ai_usage_log WHERE ok = 0 AND created_at >= strftime('%s','now','-7 days')) WHERE rn <= 2",
  )
    .all<{ feature: string; message: string }>()
    .catch(() => ({ results: [] }) as { results: { feature: string; message: string }[] });

  const signals: Record<string, unknown> = {
    sales_this_week: {
      orders: thisWeek?.orders ?? 0,
      revenue_taka: Math.round((thisWeek?.revenue ?? 0) / 100),
      gross_profit_taka: Math.round((thisWeek?.profit ?? 0) / 100),
    },
    sales_prior_week: {
      orders: priorWeek?.orders ?? 0,
      revenue_taka: Math.round((priorWeek?.revenue ?? 0) / 100),
    },
    stock: { low: lowStock?.n ?? 0, out_of_stock: outOfStock?.n ?? 0 },
    ratings_this_week: {
      count: ratingsThisWeek?.n ?? 0,
      average: Number((ratingsThisWeek?.avg_rating ?? 0).toFixed(2)),
      low_ratings: ratingsThisWeek?.low ?? 0,
    },
    errors_this_week: {
      admin_dashboard: errorsThisWeek?.admin_errors ?? 0,
      storefront: errorsThisWeek?.storefront_errors ?? 0,
      most_frequent: (topErrors.results ?? []).map((r) => ({ path: r.path, message: r.message, count: r.n })),
    },
    gemini_features_usage_this_week: (aiUsage.results ?? []).map((r) => ({
      feature: r.feature,
      successful_calls: r.ok_count,
      failed_calls: r.error_count,
      sample_errors: (aiErrors.results ?? []).filter((e) => e.feature === r.feature).map((e) => e.message),
    })),
    admin_staff_activity_this_week: {
      note: 'From audit_log — the existing record of staff actions. Never sourced from GA4, which deliberately excludes /admin traffic to keep the shop\'s real customer analytics clean.',
      by_staff_member: (auditByActor.results ?? []).map((r) => ({ actor: r.actor, actions: r.n })),
      by_action_type: (auditByAction.results ?? []).map((r) => ({ action: r.action, count: r.n })),
    },
    google_integrations_configured: googleConfigured(env),
    last_weeks_report: previousReport
      ? { status: previousReport.status, summary: previousReport.summary, days_ago: Math.round((Date.now() / 1000 - previousReport.created_at) / 86400) }
      : 'No prior report — this is the first one.',
  };

  const courierOn = await courierConfigured(env);
  if (courierOn) {
    const balance = await courierBalance(env);
    signals.courier = { configured: true, balance: balance.ok ? `৳${Math.round(balance.data / 100).toLocaleString('en-US')}` : `could not check — ${balance.error}` };
  } else {
    signals.courier = { configured: false };
  }

  if (googleConfigured(env)) {
    const ga4Property = await settingValue(env, 'ga4_property_id');
    const gscSite = await settingValue(env, 'gsc_site_url');

    if (ga4Property) {
      const ga4 = await ga4Summary(env, ga4Property, 7);
      signals.ga4_last_7_days = ga4.ok ? ga4.data : `could not read — ${ga4.error}`;
    } else {
      signals.ga4_last_7_days = 'not selected yet in Settings → Analytics';
    }

    if (gscSite) {
      const gsc = await searchConsoleSummary(env, gscSite, 7);
      signals.search_console_last_7_days = gsc.ok ? gsc.data : `could not read — ${gsc.error}`;
    } else {
      signals.search_console_last_7_days = 'not selected yet in Settings → Analytics';
    }

    const gtm = await gtmSummary(env, GTM_PUBLIC_ID);
    signals.tag_manager = gtm.ok
      ? { tags: gtm.data.tags.length, triggers: gtm.data.triggers.length, live_version: gtm.data.liveVersionName }
      : `could not read — ${gtm.error}`;
  } else {
    signals.ga4_last_7_days = 'Google integration not connected';
    signals.search_console_last_7_days = 'Google integration not connected';
    signals.tag_manager = 'Google integration not connected';
  }

  return signals;
}

const RULES = `
You are the weekly Developer & Operations report writer for Arif Gadgets, a Bangladeshi e-commerce platform. Your reader is the developer/owner — comfortable with both technical and business language. You are given real signals about the last 7 days as JSON. Write one clear, well-organised report.

Cover, in this order, using headings:
1. Overall this week — sales trend (this week vs the prior week), stock and rating health, in a couple of lines.
2. Website performance & search — GA4 traffic/conversions and Search Console clicks/impressions this week if connected, and what the Tag Manager container looks like. If not connected, say so plainly instead of guessing.
3. Errors & reliability — what broke this week (from errors_this_week), how often, and whether it looks worth fixing.
4. The AI features (admin assistant, support chat, daily health check, and this report itself) — usage and error rate this week, from gemini_features_usage_this_week. Call out anything that looks like a rate limit (a "quota"/"RESOURCE_EXHAUSTED"/429-style message) explicitly — it will fix itself once Google's limit resets, so say that plainly rather than treating it as broken.
5. Admin/staff activity — who did what this week, from admin_staff_activity_this_week. If it is empty, say plainly that no staff activity was recorded this week rather than inventing any.
6. Compared with last week's report (last_weeks_report) — note anything recurring across both weeks, or that changed. If there is no prior report, say this is the first one.
7. A short, prioritised action list — the 3 to 5 things most worth doing next, most important first. If genuinely nothing needs attention, say so — do not manufacture busy-work.

Rules:
- Base every claim ONLY on the JSON given. Never invent a number, an error, a behaviour, or a comparison that is not represented in the data.
- Write in Bangla and English mixed, direct and practical — not corporate, and not padded.
- Use clear headings (the report is read both in a Google Doc and skimmed on a phone).
- End with exactly one of these on its own final line, matching your overall verdict: [STATUS: ok] nothing needs action, [STATUS: warning] something should be looked at this week but nothing is broken, or [STATUS: error] something appears broken and needs attention soon.
`.trim();

function parseStatus(reply: string): { status: DevReportStatus; summary: string } {
  const match = reply.match(/\[STATUS:\s*(ok|warning|error)\]/i);
  const status = (match?.[1]?.toLowerCase() as DevReportStatus | undefined) ?? 'warning';
  const summary = reply.replace(/\[STATUS:\s*(ok|warning|error)\]\s*$/i, '').trim();
  return { status, summary };
}

/** Bangladesh is UTC+6 — the report is dated the way its reader will read it. */
function bdDateLabel(unixSeconds: number): string {
  const bd = new Date((unixSeconds + 6 * 3600) * 1000);
  return bd.toISOString().slice(0, 10);
}

export async function runDevReport(env: Env): Promise<DevReportResult> {
  const now = Math.floor(Date.now() / 1000);

  if (!geminiConfigured(env, 'DEVLOPER_REPORT_GEMENI')) {
    return {
      ok: false,
      status: null,
      summary: '',
      error: 'DEVLOPER_REPORT_GEMENI is not set — the weekly developer report does not run.',
      doc_written: false,
      sheet1_written: false,
      sheet2_written: false,
      checked_at: null,
    };
  }

  const signals = await gatherSignals(env);
  const result = await geminiGenerate(
    env,
    'DEVLOPER_REPORT_GEMENI',
    RULES,
    [{ role: 'user', text: `SIGNALS FOR THE LAST 7 DAYS:\n${JSON.stringify(signals, null, 2)}` }],
    { temperature: 0.3, maxOutputTokens: 3072 },
  );

  if (!result.ok) {
    await saveSetting(env, 'dev_report_error', result.error);
    await env.DB.prepare('INSERT INTO dev_reports (status, summary, error) VALUES (?, ?, ?)').bind('', '', result.error.slice(0, 2000)).run();
    return { ok: false, status: null, summary: '', error: result.error, doc_written: false, sheet1_written: false, sheet2_written: false, checked_at: null };
  }

  const { status, summary } = parseStatus(result.data);

  // Write to the Doc and both Sheets independently — one failing (a link not
  // shared with the service account yet, say) must never stop the others,
  // and every outcome is reported honestly rather than assumed.
  let docWritten = false;
  let sheet1Written = false;
  let sheet2Written = false;
  const writeErrors: string[] = [];

  const docId = await settingValue(env, 'dev_report_doc_id');
  if (docId) {
    const heading = `\n\n${'─'.repeat(60)}\nWeekly Developer Report — ${bdDateLabel(now)} — [${status.toUpperCase()}]\n${'─'.repeat(60)}\n\n${summary}\n`;
    const written = await appendToDocument(env, docId, heading);
    if (written.ok) docWritten = true;
    else writeErrors.push(`Doc: ${written.error}`);
  }

  const sheetRow = [
    bdDateLabel(now),
    status,
    (signals.sales_this_week as { orders: number }).orders,
    (signals.sales_this_week as { revenue_taka: number }).revenue_taka,
    ((signals.errors_this_week as { admin_dashboard: number; storefront: number }).admin_dashboard ?? 0) +
      ((signals.errors_this_week as { admin_dashboard: number; storefront: number }).storefront ?? 0),
    summary.slice(0, 2000),
  ];
  const header = ['Date', 'Status', 'Orders this week', 'Revenue this week (৳)', 'Errors this week', 'Summary'];

  const sheet1Id = await settingValue(env, 'dev_report_sheet1_id');
  if (sheet1Id) {
    const written = await appendLogRow(env, sheet1Id, 'Weekly Report', header, sheetRow);
    if (written.ok) sheet1Written = true;
    else writeErrors.push(`Sheet 1: ${written.error}`);
  }

  const sheet2Id = await settingValue(env, 'dev_report_sheet2_id');
  if (sheet2Id) {
    const written = await appendLogRow(env, sheet2Id, 'Weekly Report', header, sheetRow);
    if (written.ok) sheet2Written = true;
    else writeErrors.push(`Sheet 2: ${written.error}`);
  }

  const writeError = writeErrors.join(' · ');

  await Promise.all([
    saveSetting(env, 'dev_report_status', status),
    saveSetting(env, 'dev_report_summary', summary),
    saveSetting(env, 'dev_report_checked_at', String(now)),
    saveSetting(env, 'dev_report_error', writeError),
  ]);
  await env.DB.prepare('INSERT INTO dev_reports (status, summary, error) VALUES (?, ?, ?)')
    .bind(status, summary.slice(0, 4000), writeError.slice(0, 2000))
    .run();

  return {
    ok: true,
    status,
    summary,
    error: writeError,
    doc_written: docWritten,
    sheet1_written: sheet1Written,
    sheet2_written: sheet2Written,
    checked_at: now,
  };
}
