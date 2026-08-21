/**
 * Google Docs — append-only writes into a document the owner shared with the
 * service account (Editor access). Deliberately never clears or overwrites
 * anything already in the document: each call adds one more dated section
 * after whatever is already there, so a template or notes the owner already
 * put in the doc are never touched.
 */

import type { Env } from '../types';
import { googleAccessToken, type GoogleAuthResult } from './googleAuth';

const SCOPE = 'https://www.googleapis.com/auth/documents';
const API = 'https://docs.googleapis.com/v1/documents';

export type DocsResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fromAuth<T>(auth: GoogleAuthResult): DocsResult<T> | null {
  return auth.ok ? null : { ok: false, error: auth.error };
}

/** Accepts a bare ID or a full docs.google.com URL — whatever was pasted into Settings. */
export function parseDocumentId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<DocsResult<T>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: `Docs replied with ${res.status} and a non-JSON body.` };
  }
  if (!res.ok) {
    const err = (payload as { error?: { message?: string } })?.error?.message;
    return { ok: false, error: err || `Docs API returned ${res.status}.` };
  }
  return { ok: true, data: payload as T };
}

/**
 * Appends plain text to the very end of the document, after everything
 * already there. Google Docs always keeps one trailing structural newline
 * at the end of the body that text cannot be inserted past, hence
 * `endIndex - 1` — reading the document first to find it means this works
 * correctly however much (or little, or nothing) is already in the doc.
 */
export async function appendToDocument(env: Env, documentId: string, text: string): Promise<DocsResult<null>> {
  const auth = await googleAccessToken(env, SCOPE);
  const early = fromAuth<null>(auth);
  if (early) return early;
  const token = (auth as { ok: true; token: string }).token;

  const insertAt = await endOfDocument(token, documentId);
  if (typeof insertAt !== 'number') return insertAt;

  const written = await call(token, `/${documentId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: insertAt }, text } }],
    }),
  });
  if (!written.ok) return written;

  return { ok: true, data: null };
}

async function endOfDocument(token: string, documentId: string): Promise<number | DocsResult<null>> {
  const doc = await call<{ body?: { content?: { endIndex?: number }[] } }>(
    token,
    `/${documentId}?fields=body.content.endIndex`,
  );
  if (!doc.ok) return doc;

  const content = doc.data.body?.content ?? [];
  const endIndex = content.length ? (content[content.length - 1].endIndex ?? 1) : 1;
  return Math.max(endIndex - 1, 1);
}

export interface DocSection {
  heading: string;
  body: string;
}

/**
 * Appends one real, formatted report section — a title, a heading + body per
 * section, and a bulleted action-item list — rather than dumping markdown
 * (##, **) as literal text, which Google Docs does not interpret and which
 * just showed up as stray punctuation on the page.
 *
 * Works in two batchUpdate calls: the first inserts the whole block as plain
 * text in one shot (so every character position below is exactly known,
 * rather than guessed), the second applies heading/bullet styling to the
 * exact ranges just inserted. Style requests never touch anything that was
 * already in the document above this block.
 */
export async function appendFormattedReport(
  env: Env,
  documentId: string,
  opts: { title: string; sections: DocSection[]; actionItems: string[] },
): Promise<DocsResult<null>> {
  const auth = await googleAccessToken(env, SCOPE);
  const early = fromAuth<null>(auth);
  if (early) return early;
  const token = (auth as { ok: true; token: string }).token;

  const insertAt = await endOfDocument(token, documentId);
  if (typeof insertAt !== 'number') return insertAt;

  let text = '';
  const headingRanges: { start: number; end: number; style: 'HEADING_1' | 'HEADING_2' }[] = [];

  const titleStart = insertAt + text.length;
  text += `${opts.title}\n`;
  headingRanges.push({ start: titleStart, end: insertAt + text.length, style: 'HEADING_1' });

  for (const section of opts.sections) {
    const headingStart = insertAt + text.length;
    text += `${section.heading}\n`;
    headingRanges.push({ start: headingStart, end: insertAt + text.length, style: 'HEADING_2' });
    text += `${section.body.trim() || '—'}\n\n`;
  }

  let bulletRange: { start: number; end: number } | null = null;
  if (opts.actionItems.length) {
    const bulletStart = insertAt + text.length;
    for (const item of opts.actionItems) text += `${item}\n`;
    bulletRange = { start: bulletStart, end: insertAt + text.length };
  }
  text += '\n';

  const inserted = await call(token, `/${documentId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ insertText: { location: { index: insertAt }, text } }] }),
  });
  if (!inserted.ok) return inserted;

  const styleRequests: unknown[] = headingRanges.map((r) => ({
    updateParagraphStyle: {
      range: { startIndex: r.start, endIndex: r.end },
      paragraphStyle: { namedStyleType: r.style },
      fields: 'namedStyleType',
    },
  }));
  if (bulletRange) {
    styleRequests.push({
      createParagraphBullets: {
        range: { startIndex: bulletRange.start, endIndex: bulletRange.end },
        bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
      },
    });
  }

  // The text itself is already safely written at this point; this second
  // call only adds heading/bullet styling on top of it. A failure here is
  // still reported honestly (never silently swallowed) even though the
  // report's actual content made it into the document either way.
  const styled = await call(token, `/${documentId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: styleRequests }),
  });
  if (!styled.ok) return styled;

  return { ok: true, data: null };
}
