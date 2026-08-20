/**
 * Google Search Console — read-only. Same service-account pattern as GA4:
 * discover which verified sites this account can see, then pull real search
 * performance for whichever one the owner picks.
 */

import type { Env } from '../types';
import { googleAccessToken, type GoogleAuthResult } from './googleAuth';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export type GscResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fromAuth<T>(auth: GoogleAuthResult): GscResult<T> | null {
  return auth.ok ? null : { ok: false, error: auth.error };
}

/** Every site this service account is verified on — either a URL-prefix property or a "sc-domain:" property. */
export async function listSearchConsoleSites(env: Env): Promise<GscResult<string[]>> {
  const auth = await googleAccessToken(env, SCOPE);
  const early = fromAuth<string[]>(auth);
  if (early) return early;

  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${(auth as { ok: true; token: string }).token}` },
  });
  const text = await res.text();
  let payload: { siteEntry?: { siteUrl: string }[]; error?: { message?: string } };
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: `Search Console replied with ${res.status} and a non-JSON body.` };
  }
  if (!res.ok) return { ok: false, error: payload.error?.message || `Search Console returned ${res.status}.` };

  return { ok: true, data: (payload.siteEntry ?? []).map((s) => s.siteUrl) };
}

export interface SearchQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: SearchQuery[];
}

export async function searchConsoleSummary(env: Env, siteUrl: string, days: number): Promise<GscResult<SearchConsoleSummary>> {
  const auth = await googleAccessToken(env, SCOPE);
  const early = fromAuth<SearchConsoleSummary>(auth);
  if (early) return early;
  const token = (auth as { ok: true; token: string }).token;

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ['query'], rowLimit: 10 }),
    },
  );
  const text = await res.text();
  let payload: { rows?: { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }[]; error?: { message?: string } };
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: `Search Console replied with ${res.status} and a non-JSON body.` };
  }
  if (!res.ok) return { ok: false, error: payload.error?.message || `Search Console returned ${res.status}.` };

  const rows = payload.rows ?? [];
  const totals = rows.reduce(
    (sum, r) => ({
      clicks: sum.clicks + r.clicks,
      impressions: sum.impressions + r.impressions,
      position: sum.position + r.position * r.impressions,
    }),
    { clicks: 0, impressions: 0, position: 0 },
  );

  return {
    ok: true,
    data: {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
      position: totals.impressions ? totals.position / totals.impressions : 0,
      topQueries: rows
        .map((r) => ({ query: r.keys?.[0] ?? '', clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }))
        .sort((a, b) => b.clicks - a.clicks),
    },
  };
}
