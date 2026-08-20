import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { badRequest, readJson } from '../lib/http';
import { supportAssistantConfigured, supportAssistantReply } from '../lib/supportAssistant';
import type { GeminiTurn } from '../lib/gemini';

export const support = new Hono<{ Bindings: Env; Variables: Variables }>();

support.get('/status', (c) => {
  return c.json({ connected: supportAssistantConfigured(c.env) });
});

/**
 * Public and unauthenticated — anyone on the storefront can open this chat
 * without signing in. That means it also needs its own abuse guard, unlike
 * the admin assistant which is already behind a staff login: a coarse
 * per-IP-per-day cap in KV, cheap to check, generous enough that no real
 * shopper will ever see it, and reported plainly rather than as a silent
 * failure when it is hit.
 */
const DAILY_LIMIT = 40;

async function rateLimited(env: Env, ip: string): Promise<boolean> {
  if (!env.CACHE) return false; // no KV bound (e.g. some local setups) — fail open, not closed
  const day = new Date().toISOString().slice(0, 10);
  const key = `support-chat-rl:${day}:${ip}`;
  const current = Number((await env.CACHE.get(key)) ?? '0');
  if (current >= DAILY_LIMIT) return true;
  await env.CACHE.put(key, String(current + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

support.post('/chat', async (c) => {
  if (!supportAssistantConfigured(c.env)) {
    return c.json({ ok: false, error: 'Support chat is not configured yet.', reply: '' });
  }

  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  if (await rateLimited(c.env, ip)) {
    return c.json({
      ok: false,
      error: "You've reached today's message limit for this chat — please contact support directly by phone or WhatsApp instead.",
      reply: '',
    });
  }

  const body = await readJson(c);
  const historyRaw = Array.isArray(body.history) ? body.history : [];
  const history: GeminiTurn[] = historyRaw
    .filter((t: unknown): t is { role: string; text: string } => {
      const turn = t as { role?: unknown; text?: unknown };
      return (turn.role === 'user' || turn.role === 'model') && typeof turn.text === 'string' && turn.text.trim().length > 0;
    })
    // Public endpoint — keep each turn short, both to bound cost and because
    // a legitimate question never needs more than this.
    .map((t) => ({ role: t.role as 'user' | 'model', text: String(t.text).slice(0, 800) }));

  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    badRequest('Send "history": an array of {role,text} turns ending with a user message.');
  }
  if (history.length > 16) badRequest('This conversation has gotten too long — please start a new chat.');

  const result = await supportAssistantReply(c.env, history);
  if (!result.ok) return c.json({ ok: false, error: result.error, reply: '' });
  return c.json({ ok: true, error: '', reply: result.data });
});
