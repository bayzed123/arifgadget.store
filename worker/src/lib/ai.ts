/**
 * The Worker's text-generation client — Cloudflare Workers AI, called
 * through the native `AI` binding (see wrangler.toml's [ai] block). No API
 * key, no separate account, no external HTTP call: `env.AI` is authenticated
 * by the Cloudflare account itself, the same way DB/CACHE/MEDIA are.
 *
 * This replaces the four separate Gemini API keys this codebase used to
 * carry (ADMIN_GEMINI_API_KEY, SUPPORT_GEMINI_API_KEY, ALERT_GEMINI_API_KEY,
 * DEVLOPER_REPORT_GEMENI) after the Google Cloud project behind them got
 * denied access to the Gemini API entirely (a project-level block, confirmed
 * by ai_usage_log — every key under that project failed identically,
 * regardless of which one was used). Workers AI has no equivalent failure
 * mode: it's part of the same Cloudflare account this Worker already runs
 * on, with a genuine free daily allocation (Neurons) that needs no billing
 * card, and cannot be revoked by a third party.
 *
 * All four features share one binding now rather than four separate keys —
 * there is no per-feature quota to isolate on Workers AI the way there was
 * with four independent Google Cloud API keys, so the separation no longer
 * serves a purpose. `feature` is kept purely as a label for ai_usage_log, so
 * the weekly developer report can still break usage down per feature.
 *
 * Every call — successful or not — is logged to D1 (ai_usage_log),
 * fire-and-forget, same as before.
 */

import type { Env } from '../types';

export type AiFeature = 'admin_assistant' | 'support_chat' | 'health_check' | 'dev_report';

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface AiTurn {
  role: 'user' | 'model';
  text: string;
}

// A capable, still-fast fp8-quantized 70B instruct model — one model for all
// four features rather than picking a different one per feature, so there is
// exactly one request/response shape to maintain. Supports both a plain chat
// reply and strict JSON-schema output (used by the weekly dev report), so it
// covers everything the old Gemini client did.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export function aiConfigured(env: Env): boolean {
  return Boolean(env.AI);
}

interface AiGenerateOptions {
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * A JSON Schema object. When set, the model is constrained to return JSON
   * matching this shape — used by the weekly developer report so its
   * sections can be written into the Doc/Sheet with real formatting, rather
   * than parsing markdown out of a chat-style reply.
   */
  jsonSchema?: Record<string, unknown>;
}

/** Best-effort — a logging failure must never take down the actual feature. */
async function logUsage(env: Env, feature: AiFeature, result: AiResult<string>): Promise<void> {
  try {
    await env.DB.prepare('INSERT INTO ai_usage_log (feature, ok, error) VALUES (?, ?, ?)')
      .bind(feature, result.ok ? 1 : 0, result.ok ? '' : result.error.slice(0, 500))
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
export async function aiGenerate(
  env: Env,
  feature: AiFeature,
  systemInstruction: string,
  history: AiTurn[],
  opts: AiGenerateOptions = {},
): Promise<AiResult<string>> {
  const result = await callAi(env, systemInstruction, history, opts);
  await logUsage(env, feature, result);
  return result;
}

async function callAi(env: Env, systemInstruction: string, history: AiTurn[], opts: AiGenerateOptions): Promise<AiResult<string>> {
  if (!env.AI) {
    return { ok: false, error: 'Workers AI is not bound — add [ai]\n binding = "AI" to wrangler.toml and redeploy.' };
  }
  if (history.length === 0) {
    return { ok: false, error: 'No message to send.' };
  }

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.map((turn) => ({ role: turn.role === 'model' ? 'assistant' : 'user', content: turn.text })),
  ];

  let raw: unknown;
  try {
    raw = await env.AI.run(MODEL, {
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxOutputTokens ?? 1024,
      ...(opts.jsonSchema ? { response_format: { type: 'json_schema' as const, json_schema: opts.jsonSchema } } : {}),
    });
  } catch (err) {
    // Workers AI throws (rather than returning a non-2xx body) on things
    // like the daily free-Neuron allocation running out — surfaced plainly
    // here so callers (the weekly dev report especially) can say exactly
    // that rather than a generic failure.
    return { ok: false, error: `Workers AI request failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const text = typeof raw === 'string' ? raw : (raw as { response?: string } | undefined)?.response;
  if (!text || !text.trim()) {
    return { ok: false, error: 'Workers AI returned an empty reply.' };
  }

  return { ok: true, data: text.trim() };
}
