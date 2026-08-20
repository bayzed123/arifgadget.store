/**
 * Thin wrapper over the Gemini REST API (generateContent). Unlike the Google
 * Analytics/Search Console/Sheets integrations, Gemini authenticates with a
 * plain API key — no service-account JWT exchange, no OAuth token to cache.
 *
 * Three independent keys share this one client (ADMIN_GEMINI_API_KEY,
 * SUPPORT_GEMINI_API_KEY, ALERT_GEMINI_API_KEY) — see types.ts for why they
 * are kept separate. Every caller passes which one it means; this file never
 * picks a default, so a missing key always fails loud and specific rather
 * than silently borrowing another feature's key.
 */

import type { Env } from '../types';

export type GeminiKeyName = 'ADMIN_GEMINI_API_KEY' | 'SUPPORT_GEMINI_API_KEY' | 'ALERT_GEMINI_API_KEY';

export type GeminiResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Flash: fast and inexpensive enough for a chat reply or a daily digest —
// none of these three features need the heaviest reasoning tier.
const MODEL = 'gemini-2.5-flash';

export function geminiConfigured(env: Env, key: GeminiKeyName): boolean {
  return Boolean(env[key]?.trim());
}

export interface GeminiTurn {
  role: 'user' | 'model';
  text: string;
}

interface GeminiOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

interface GeminiApiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

/**
 * One request/response turn. `systemInstruction` is the grounding/persona
 * prompt (rebuilt fresh per call with live data where relevant — never
 * cached, so it can never go stale); `history` is the prior turns in the
 * conversation, oldest first, ending with the new user message.
 */
export async function geminiGenerate(
  env: Env,
  key: GeminiKeyName,
  systemInstruction: string,
  history: GeminiTurn[],
  opts: GeminiOptions = {},
): Promise<GeminiResult<string>> {
  const apiKey = env[key]?.trim();
  if (!apiKey) {
    return { ok: false, error: `${key} is not set — this feature is not configured.` };
  }
  if (history.length === 0) {
    return { ok: false, error: 'No message to send.' };
  }

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
    },
  };

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: `Could not reach Gemini: ${err instanceof Error ? err.message : String(err)}` };
  }

  const text = await res.text();
  let payload: GeminiApiResponse;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: `Gemini replied with ${res.status} and a non-JSON body.` };
  }

  if (!res.ok) {
    return { ok: false, error: payload.error?.message || `Gemini API returned ${res.status}.` };
  }

  if (payload.promptFeedback?.blockReason) {
    return { ok: false, error: `Gemini declined to answer (${payload.promptFeedback.blockReason}).` };
  }

  const reply = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!reply.trim()) {
    return { ok: false, error: 'Gemini returned an empty reply.' };
  }

  return { ok: true, data: reply.trim() };
}
