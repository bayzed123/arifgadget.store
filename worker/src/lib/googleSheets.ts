/**
 * Google Sheets — writes real shop data into named tabs of a spreadsheet the
 * owner shared with the service account. Each sync fully replaces a tab's
 * content rather than appending, so re-running it (by hand or on the hourly
 * cron) never leaves stale rows sitting below fresh ones.
 */

import type { Env } from '../types';
import { googleAccessToken, type GoogleAuthResult } from './googleAuth';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export type SheetsResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fromAuth<T>(auth: GoogleAuthResult): SheetsResult<T> | null {
  return auth.ok ? null : { ok: false, error: auth.error };
}

/** Accepts a bare ID or a full docs.google.com URL — whatever was pasted into Settings. */
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<SheetsResult<T>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: `Sheets replied with ${res.status} and a non-JSON body.` };
  }
  if (!res.ok) {
    const err = (payload as { error?: { message?: string } })?.error?.message;
    return { ok: false, error: err || `Sheets returned ${res.status}.` };
  }
  return { ok: true, data: payload as T };
}

/** One page of data: a tab title and the grid to fill it with — row 0 is the header. */
export interface SheetPage {
  title: string;
  rows: (string | number)[][];
}

/**
 * Writes every page, creating any tab that does not exist yet. Each tab's
 * old content is cleared first, so a shrinking dataset (fewer orders than
 * last time is impossible, but fewer low-stock products, say) doesn't leave
 * orphaned rows below the new data.
 */
export async function syncSpreadsheet(env: Env, spreadsheetId: string, pages: SheetPage[]): Promise<SheetsResult<null>> {
  const auth = await googleAccessToken(env, SCOPE);
  const early = fromAuth<null>(auth);
  if (early) return early;
  const token = (auth as { ok: true; token: string }).token;

  const meta = await call<{ sheets?: { properties: { title: string } }[] }>(token, `/${spreadsheetId}?fields=sheets.properties.title`);
  if (!meta.ok) return meta;
  const existingTitles = new Set((meta.data.sheets ?? []).map((s) => s.properties.title));

  const missing = pages.filter((p) => !existingTitles.has(p.title));
  if (missing.length) {
    const created = await call(token, `/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: missing.map((p) => ({ addSheet: { properties: { title: p.title } } })) }),
    });
    if (!created.ok) return created;
  }

  for (const page of pages) {
    const range = encodeURIComponent(`${page.title}!A1:ZZ`);
    const cleared = await call(token, `/${spreadsheetId}/values/${range}:clear`, { method: 'POST', body: '{}' });
    if (!cleared.ok) return cleared;

    const writeRange = encodeURIComponent(`${page.title}!A1`);
    const written = await call(token, `/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: page.rows }),
    });
    if (!written.ok) return written;
  }

  return { ok: true, data: null };
}
