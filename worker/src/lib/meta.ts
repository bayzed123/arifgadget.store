import type { Env } from '../types';

const GRAPH_VERSION = 'v20.0';
const PIXEL_ID_KEYS = ['DATA-META-PIXEL-ID', 'META_PIXEL_ID'] as const;
const TOKEN_KEYS = ['META-CAPI', 'META_CAPI_TOKEN'] as const;

export type MetaServerEventInput = {
  eventName: 'AddToCart' | 'InitiateCheckout' | 'Purchase';
  eventId: string;
  request: Request;
  sourceUrl?: string;
  email?: string;
  phone?: string;
  customData: Record<string, unknown>;
};

type MetaEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: 'website';
  event_source_url?: string;
  user_data: Record<string, string | string[] | undefined>;
  custom_data?: Record<string, unknown>;
};

function secret(env: Env, keys: readonly string[]): string {
  for (const key of keys) {
    const value = env[key as keyof Env];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('880') ? digits : digits.startsWith('0') ? `88${digits}` : digits;
}

/** Best-effort server event delivery; never blocks or fails a storefront action. */
export async function sendMetaEvent(env: Env, input: MetaServerEventInput): Promise<void> {
  const pixelId = secret(env, PIXEL_ID_KEYS);
  const accessToken = secret(env, TOKEN_KEYS);
  if (!pixelId || !accessToken) return;

  const email = input.email?.trim();
  const phone = input.phone ? normalisePhone(input.phone) : '';
  const userData: MetaEvent['user_data'] = {
    ...(email ? { em: await sha256(email) } : {}),
    ...(phone ? { ph: await sha256(phone) } : {}),
    ...(input.request.headers.get('cf-connecting-ip') ? { client_ip_address: input.request.headers.get('cf-connecting-ip')! } : {}),
    ...(input.request.headers.get('user-agent') ? { client_user_agent: input.request.headers.get('user-agent')! } : {}),
  };

  const event: MetaEvent = {
    event_name: input.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: 'website',
    event_source_url: input.sourceUrl ?? new URL(input.request.url).origin,
    user_data: userData,
    custom_data: input.customData,
  };

  try {
    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: [event] }),
    });
  } catch {
    // Analytics is non-critical and must not affect storefront actions.
  }
}

export interface MetaOrderInput {
  orderNo: string;
  total: number;
  items: Array<{ product_id: number; qty: number; unit_price: number }>;
  email?: string;
  phone?: string;
  request: Request;
}

export async function sendMetaPurchase(env: Env, input: MetaOrderInput): Promise<void> {
  await sendMetaEvent(env, {
    eventName: 'Purchase',
    eventId: input.orderNo,
    request: input.request,
    sourceUrl: `${new URL(input.request.url).origin}/checkout`,
    email: input.email,
    phone: input.phone,
    customData: {
      currency: 'BDT',
      value: Math.round(input.total) / 100,
      order_id: input.orderNo,
      content_type: 'product',
      contents: input.items.map((item) => ({
        id: String(item.product_id),
        quantity: item.qty,
        item_price: Math.round(item.unit_price) / 100,
      })),
    },
  });
}
