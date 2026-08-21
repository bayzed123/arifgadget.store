/**
 * Thin wrapper over the Gemini REST API (generateContent). Unlike the Google
 * Analytics/Search Console/Sheets integrations, Gemini authenticates with a
 * plain API key — no service-account JWT exchange, no OAuth token to cache.
 *
 * Four independent keys share this one client (ADMIN_GEMINI_API_KEY,
 * SUPPORT_GEMINI_API_KEY, ALERT_GEMINI_API_KEY, DEVLOPER_REPORT_GEMENI) —
 * see types.ts for why they are kept separate. Every caller passes which one
 * it means; this file never picks a default, so a missing key always fails
 * loud and specific rather than silently borrowing another feature's key.
 *
 * Every call — successful or not — is logged to D1 (ai_usage_log), fire-
 * and-forget, so the weekly developer report (devReport.ts) has a real,
 * un-fabricated record of how much each feature was used and how often it
 * failed, rather than having to guess.
 */

import type { Env } from '../types';

export type GeminiKeyName = 'ADMIN_GEMINI_API_KEY' | 'SUPPORT_GEMINI_API_KEY' | 'ALERT_GEMINI_API_KEY' | 'DEVLOPER_REPORT_GEMENI';

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

/** Best-effort — a logging failure must never take down the actual feature. */
async function logUsage(env: Env, key: GeminiKeyName, result: GeminiResult<string>): Promise<void> {
  try {
    await env.DB.prepare('INSERT INTO ai_usage_log (feature, ok, error) VALUES (?, ?, ?)')
      .bind(key, result.ok ? 1 : 0, result.ok ? '' : result.error.slice(0, 500))
      .run();
  } catch {
    /* the feature's own result still returns normally either way */
  }
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
  const result = await callGemini(env, key, systemInstruction, history, opts);
  await logUsage(env, key, result);
  return result;
}

async function callGemini(
  env: Env,
  key: GeminiKeyName,
  systemInstruction: string,
  history: GeminiTurn[],
  opts: GeminiOptions,
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
