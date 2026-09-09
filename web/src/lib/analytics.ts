/**
 * Google Analytics 4 — every commerce step the shop needs, reported through
 * the standard GA4 e-commerce schema so the built-in Monetisation reports and
 * the funnel work without any custom configuration in the GA console.
 *
 * Two rules the whole file obeys:
 *
 *  1. **Money is sent in taka, not poisha.** Everything inside this codebase
 *     is integer minor units; GA4 expects a decimal in the reported currency.
 *     Sending 425000 instead of 4250.00 would inflate revenue a hundredfold.
 *  2. **Staff and developers are never counted.** Events are dropped on
 *     localhost and on every /admin screen, so the shop's own clicking does
 *     not look like customer behaviour.
 */

export const GA_MEASUREMENT_ID = 'G-0NMRBW4SEG';

const CURRENCY = 'BDT';

type GtagArgs = [string, ...unknown[]];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: GtagArgs) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

/** Poisha → taka, rounded to two decimals as GA4 expects. */
export const taka = (poisha: number): number => Math.round(poisha) / 100;

/** True when this visit should be measured at all. */
function measurable(): boolean {
  if (typeof window === 'undefined') return false;

  const { hostname, pathname } = window.location;
  // Local development and preview builds must not reach the shop's property.
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) return false;
  // Staff working in the dashboard are not shoppers.
  if (pathname.startsWith('/admin')) return false;

  return typeof window.gtag === 'function' || typeof window.fbq === 'function';
}

import { api } from './api';

/** Fire-and-forget. Analytics must never break a checkout. */
function send(event: string, params: Record<string, unknown> = {}): void {
  if (!measurable()) return;
  try {
    const { event_id: suppliedEventId, ...eventParams } = params;
    const event_id = suppliedEventId ?? (event === 'add_to_cart' || event === 'begin_checkout' ? crypto.randomUUID() : undefined);
    window.gtag?.('event', event, eventParams);
    const metaNames: Record<string, string> = {
      page_view: 'PageView',
      view_item: 'ViewContent',
      view_item_list: 'ViewContent',
      select_item: 'ViewContent',
      search: 'Search',
      add_to_cart: 'AddToCart',
      remove_from_cart: 'RemoveFromCart',
      view_cart: 'ViewCart',
      begin_checkout: 'InitiateCheckout',
      add_shipping_info: 'AddShippingInfo',
      add_payment_info: 'AddPaymentInfo',
      purchase: 'Purchase',
      sign_up: 'CompleteRegistration',
      login: 'Login',
      contact: 'Contact',
      select_promotion: 'ViewContent',
    };
    const metaEvent = metaNames[event] ?? event;
    const metaArgs: unknown[] = ['track', metaEvent, eventParams];
    if (event_id) metaArgs.push({ eventID: event_id });
    window.fbq?.(...metaArgs);

    // Meta's browser and server events share this ID for deduplication. The
    // Worker supplies IP/user-agent data and reads the CAPI token privately.
    if (event_id && (event === 'add_to_cart' || event === 'begin_checkout')) {
      const items = Array.isArray(eventParams.items) ? eventParams.items : [];
      void api('/api/meta/events', {
        method: 'POST',
        body: {
          event_name: metaEvent,
          event_id,
          source_url: typeof window === 'undefined' ? undefined : window.location.href,
          custom_data: {
            currency: eventParams.currency,
            value: eventParams.value,
            content_type: 'product',
            content_ids: items.map((item) => (item as { item_id?: string }).item_id).filter(Boolean),
            contents: items.map((item) => {
              const line = item as { item_id?: string; price?: number; quantity?: number };
              return { id: line.item_id, quantity: line.quantity ?? 1, item_price: line.price };
            }),
          },
        },
      }).catch(() => undefined);
    }
  } catch {
    /* a blocked or failed tracker is not the shopper's problem */
  }
}

/* ─────────────────────────── item shapes ─────────────────────────── */

/** The subset of a product GA4 needs. Accepts storefront and cart shapes alike. */
export interface TrackableItem {
  id?: number;
  product_id?: number;
  sku?: string;
  name: string;
  price?: number;
  unit_price?: number;
  qty?: number;
  brand?: string;
  category?: { name?: string } | string | null;
}

function categoryName(category: TrackableItem['category']): string | undefined {
  if (!category) return undefined;
  return typeof category === 'string' ? category : category.name;
}

/** One product in GA4's `items` array. */
function gaItem(item: TrackableItem, index?: number) {
  const price = item.unit_price ?? item.price ?? 0;
  return {
    item_id: item.sku ?? String(item.product_id ?? item.id ?? ''),
    item_name: item.name,
    item_brand: item.brand || undefined,
    item_category: categoryName(item.category),
    price: taka(price),
    quantity: item.qty ?? 1,
    ...(index === undefined ? {} : { index }),
  };
}

const itemsValue = (items: TrackableItem[]): number =>
  taka(items.reduce((sum, i) => sum + (i.unit_price ?? i.price ?? 0) * (i.qty ?? 1), 0));

/* ─────────────────────────── page and search ─────────────────────────── */

/** Every route change, including the first paint. */
export function trackPageView(path: string, title?: string): void {
  send('page_view', {
    page_path: path,
    page_location: typeof window === 'undefined' ? undefined : window.location.href,
    page_title: title ?? (typeof document === 'undefined' ? undefined : document.title),
  });
}

export function trackSearch(term: string): void {
  if (!term.trim()) return;
  send('search', { search_term: term.trim() });
}

/* ─────────────────────────── browsing ─────────────────────────── */

export function trackViewItemList(listName: string, items: TrackableItem[]): void {
  if (items.length === 0) return;
  send('view_item_list', {
    item_list_name: listName,
    items: items.slice(0, 20).map((item, i) => gaItem(item, i)),
  });
}

export function trackViewItem(item: TrackableItem): void {
  send('view_item', { currency: CURRENCY, value: itemsValue([item]), items: [gaItem(item)] });
}

export function trackSelectItem(listName: string, item: TrackableItem): void {
  send('select_item', { item_list_name: listName, items: [gaItem(item)] });
}

/* ─────────────────────────── cart ─────────────────────────── */

export function trackAddToCart(item: TrackableItem, qty: number): void {
  const line = { ...item, qty };
  send('add_to_cart', { currency: CURRENCY, value: itemsValue([line]), items: [gaItem(line)] });
}

export function trackRemoveFromCart(item: TrackableItem): void {
  send('remove_from_cart', { currency: CURRENCY, value: itemsValue([item]), items: [gaItem(item)] });
}

export function trackViewCart(items: TrackableItem[], value: number): void {
  if (items.length === 0) return;
  send('view_cart', { currency: CURRENCY, value: taka(value), items: items.map((i) => gaItem(i)) });
}

/* ─────────────────────────── checkout ─────────────────────────── */

export function trackBeginCheckout(items: TrackableItem[], value: number): void {
  if (items.length === 0) return;
  send('begin_checkout', { currency: CURRENCY, value: taka(value), items: items.map((i) => gaItem(i)) });
}

/** Which delivery zone the shopper chose, and what it cost them. */
export function trackAddShippingInfo(items: TrackableItem[], value: number, zone: string): void {
  send('add_shipping_info', {
    currency: CURRENCY,
    value: taka(value),
    shipping_tier: zone === 'dhaka' ? 'Inside Dhaka' : 'Outside Dhaka',
    items: items.map((i) => gaItem(i)),
  });
}

export function trackAddPaymentInfo(items: TrackableItem[], value: number, method: string): void {
  send('add_payment_info', {
    currency: CURRENCY,
    value: taka(value),
    payment_type: method.toUpperCase(),
    items: items.map((i) => gaItem(i)),
  });
}

/**
 * The one event the shop's revenue reporting depends on. `transaction_id` is
 * the order number, so GA4 de-duplicates if the confirmation screen is
 * reloaded, and the shop can reconcile GA against the dashboard order by order.
 */
export function trackPurchase(args: {
  orderNo: string;
  value: number;
  shipping: number;
  tax: number;
  items: TrackableItem[];
  paymentMethod?: string;
  zone?: string;
}): void {
  send('purchase', {
    event_id: args.orderNo,
    transaction_id: args.orderNo,
    currency: CURRENCY,
    value: taka(args.value),
    shipping: taka(args.shipping),
    tax: taka(args.tax),
    payment_type: args.paymentMethod?.toUpperCase(),
    shipping_tier: args.zone === 'dhaka' ? 'Inside Dhaka' : 'Outside Dhaka',
    items: args.items.map((i) => gaItem(i)),
  });
}

/* ─────────────────────────── accounts and contact ─────────────────────────── */

export function trackSignUp(): void {
  send('sign_up', { method: 'phone' });
}

export function trackLogin(): void {
  send('login', { method: 'phone' });
}

/** Outbound taps the shop cares about: WhatsApp, phone, the offer popup. */
export function trackContact(channel: 'whatsapp_float' | 'whatsapp_order' | 'phone'): void {
  send('contact', { method: channel });
}

export function trackOfferClick(title: string): void {
  send('select_promotion', { promotion_name: title });
}
