import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from './types';
import { allowedOrigins } from './lib/http';
import { catalog } from './routes/catalog';
import { orders } from './routes/orders';
import { admin } from './routes/admin';
import { analytics } from './routes/analytics';
import { content } from './routes/content';
import { adminContent } from './routes/adminContent';
import { account } from './routes/account';
import { courierHook } from './routes/courierHook';
import { reviews } from './routes/reviews';
import { support } from './routes/support';
import { runSheetsSync } from './lib/sheetsSync';
import { runHealthCheck } from './lib/healthCheck';
import { runDevReport } from './lib/devReport';

const DAILY_HEALTH_CHECK_CRON = '0 2 * * *';
const WEEKLY_DEV_REPORT_CRON = '0 3 * * 1';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', async (c, next) => {
  const list = allowedOrigins(c.env);
  const handler = cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (list.length === 0) return origin;
      return list.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });
  return handler(c, next);
});

app.get('/', (c) =>
  c.json({
    name: `${c.env.STORE_NAME ?? 'Arif Gadgets'} API`,
    status: 'ok',
    endpoints: ['/api/storefront', '/api/products', '/api/categories', '/api/quote', '/api/orders', '/api/admin/*'],
  }),
);

app.get('/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM products').first<{ n: number }>();
  return c.json({ ok: true, products: row?.n ?? 0, time: new Date().toISOString() });
});

/** Serves product media straight out of R2 — no public bucket required. */
app.get('/files/*', async (c) => {
  if (!c.env.MEDIA) return c.notFound();

  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/files\//, ''));
  if (!key) return c.notFound();

  const object = await c.env.MEDIA.get(key);
  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
});

app.route('/api', catalog);
app.route('/api', orders);
app.route('/api', content);
app.route('/api', reviews);
app.route('/api/support', support);
app.route('/api/account', account);
// Courier callbacks. Authenticated by a secret path segment, not a session,
// because the caller is Steadfast rather than a person.
app.route('/api/courier', courierHook);

/**
 * Fires the weekly developer report on demand — the GitHub Actions "Run
 * workflow" button (see .github/workflows/dev-report-trigger.yml), for
 * whenever Monday's cron or the dashboard's Run now isn't convenient.
 * Authenticated by a secret path segment, same pattern as the Steadfast
 * webhook right above: unconfigured, wrong token, and a right-shaped-but-
 * wrong token all 404 identically, so nothing here confirms this route
 * exists to anyone who doesn't already hold the real token.
 */
app.post('/api/dev-report/trigger/:token', async (c) => {
  const expected = c.env.DEV_REPORT_TRIGGER_TOKEN?.trim();
  if (!expected || c.req.param('token') !== expected) return c.notFound();

  const result = await runDevReport(c.env);
  return c.json(result);
});

// Nested (not mounted separately) so these inherit the admin auth guard.
admin.route('/analytics', analytics);
admin.route('/content', adminContent);
app.route('/api/admin', admin);

app.notFound((c) => c.json({ error: `No route for ${c.req.method} ${new URL(c.req.url).pathname}` }, 404));

app.onError(async (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Unhandled error:', err);
  // Real, unexpected failures only — not the routine 400/401/404s above,
  // which are expected client-driven rejections rather than bugs. This is
  // the honest "admin dashboard error" / "storefront error" signal the
  // weekly developer report reads from (devReport.ts) — best-effort, so a
  // logging failure never masks the actual error response below.
  try {
    const path = new URL(c.req.url).pathname;
    await c.env.DB.prepare('INSERT INTO error_log (path, status, message, is_admin) VALUES (?, 500, ?, ?)')
      .bind(path, String(err instanceof Error ? err.message : err).slice(0, 500), path.startsWith('/api/admin') ? 1 : 0)
      .run();
  } catch {
    /* logging must never block the actual error response */
  }
  return c.json({ error: 'Something went wrong on our side. Please try again.' }, 500);
});

export default {
  fetch: app.fetch,
  /**
   * Fired by the three [triggers] crons in wrangler.toml. The weekly one
   * runs the Gemini developer report, the daily one runs the Gemini site
   * health check, and every other firing (the hourly one) syncs the owner's
   * connected Google Sheet — all three are cheap no-ops until their
   * respective feature is actually configured, so this never needs to check
   * that itself.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === WEEKLY_DEV_REPORT_CRON) {
      ctx.waitUntil(runDevReport(env).catch(() => undefined));
      return;
    }
    if (event.cron === DAILY_HEALTH_CHECK_CRON) {
      ctx.waitUntil(runHealthCheck(env).catch(() => undefined));
      return;
    }
    ctx.waitUntil(runSheetsSync(env).catch(() => undefined));
  },
};
