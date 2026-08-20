/**
 * GA4 — read-only, via the Google Analytics Admin API (to find which
 * property the shop's service account can see) and the Analytics Data API
 * (to pull real numbers from it). Everything here is a plain read; nothing
 * in this file can change a setting inside GA4 itself.
 */

import type { Env } from '../types';
import { googleAccessToken, type GoogleAuthResult } from './googleAuth';

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export type GaResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fromAuth<T>(auth: GoogleAuthResult): GaResult<T> | null {
  return auth.ok ? null : { ok: false, error: auth.error };
}

export interface Ga4Property {
  property: string; // "properties/123456789"
  displayName: string;
  account: string;
}

/** Every GA4 property this service account can currently see — how the owner picks the right one without knowing its numeric ID. */
export async function listGa4Properties(env: Env): Promise<GaResult<Ga4Property[]>> {
  const auth = await googleAccessToken(env, SCOPE);
  const early = fromAuth<Ga4Property[]>(auth);
  if (early) return early;

  const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', {
    headers: { Authorization: `Bearer ${(auth as { ok: true; token: string }).token}` },
  });
  const text = await res.text();
  let payload: {
    accountSummaries?: {
      account: string;
      displayName: string;
      propertySummaries?: { property: string; displayName: string }[];
    }[];
    error?: { message?: string };
  };
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: `GA4 replied with ${res.status} and a non-JSON body.` };
  }
  if (!res.ok) {
    return { ok: false, error: payload.error?.message || `GA4 Admin API returned ${res.status}.` };
  }

  const properties: Ga4Property[] = [];
  for (const account of payload.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
      properties.push({ property: prop.property, displayName: prop.displayName, account: account.displayName });
    }
  }
  return { ok: true, data: properties };
}

export interface Ga4Summary {
  sessions: number;
  activeUsers: number;
  conversions: number;
  pageViews: number;
  topPages: { path: string; views: number }[];
}

async function runReport(token: string, property: string, body: unknown): Promise<GaResult<unknown>> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: `GA4 replied with ${res.status} and a non-JSON body.` };
  }
  if (!res.ok) {
    const err = (payload as { error?: { message?: string } })?.error?.message;
    return { ok: false, error: err || `GA4 Data API returned ${res.status}.` };
  }
  return { ok: true, data: payload };
}

/** Sessions, users, conversions and the top pages for the last N days on the chosen property. */
export async function ga4Summary(env: Env, property: string, days: number): Promise<GaResult<Ga4Summary>> {
  const auth = await googleAccessToken(env, SCOPE);
  const early = fromAuth<Ga4Summary>(auth);
  if (early) return early;
  const token = (auth as { ok: true; token: string }).token;

  const range = { startDate: `${days}daysAgo`, endDate: 'today' };

  const [totals, pages] = await Promise.all([
    runReport(token, property, {
      dateRanges: [range],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'conversions' }, { name: 'screenPageViews' }],
    }),
    runReport(token, property, {
      dateRanges: [range],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 8,
    }),
  ]);

  if (!totals.ok) return totals;
  if (!pages.ok) return pages;

  type Report = { rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] };
  const totalsRow = (totals.data as Report).rows?.[0]?.metricValues ?? [];
  const pageRows = (pages.data as Report).rows ?? [];

  return {
    ok: true,
    data: {
      sessions: Number(totalsRow[0]?.value ?? 0),
      activeUsers: Number(totalsRow[1]?.value ?? 0),
      conversions: Number(totalsRow[2]?.value ?? 0),
      pageViews: Number(totalsRow[3]?.value ?? 0),
      topPages: pageRows.map((row) => ({
        path: row.dimensionValues?.[0]?.value ?? '',
        views: Number(row.metricValues?.[0]?.value ?? 0),
      })),
    },
  };
}
