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

// Nested (not mounted separately) so these inherit the admin auth guard.
admin.route('/analytics', analytics);
admin.route('/content', adminContent);
app.route('/api/admin', admin);

app.notFound((c) => c.json({ error: `No route for ${c.req.method} ${new URL(c.req.url).pathname}` }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Something went wrong on our side. Please try again.' }, 500);
});

export default app;
