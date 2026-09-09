import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { badRequest, readJson } from '../lib/http';
import { sendMetaEvent } from '../lib/meta';

export const metaEvents = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Browser Pixel and CAPI receive the same event_id so Meta can deduplicate them.
 * Only the two requested ecommerce events are accepted from the public web.
 */
metaEvents.post('/meta/events', async (c) => {
  const body = await readJson(c);
  const eventName = body.event_name === 'AddToCart' || body.event_name === 'InitiateCheckout' ? body.event_name : '';
  const eventId = typeof body.event_id === 'string' ? body.event_id.trim().slice(0, 128) : '';
  const sourceUrl = typeof body.source_url === 'string' ? body.source_url.slice(0, 1000) : undefined;
  const customData = body.custom_data;

  if (!eventName || !eventId) badRequest('A valid event_name and event_id are required.');
  if (!customData || typeof customData !== 'object' || Array.isArray(customData)) {
    badRequest('custom_data must be an object.');
  }

  // Do not accept arbitrary user identifiers from the browser. The Worker adds
  // the request IP and user-agent itself; checkout Purchase adds hashed contact
  // fields only after the order is committed.
  c.executionCtx.waitUntil(
    sendMetaEvent(c.env, {
      eventName,
      eventId,
      request: c.req.raw,
      sourceUrl,
      customData: customData as Record<string, unknown>,
    }),
  );
  return c.body(null, 204);
});
