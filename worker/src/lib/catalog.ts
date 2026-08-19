import type { Env } from '../types';
import { parseJsonColumn } from './http';
import { parseSettings, type PriceTier, type StoreSettings } from './pricing';

export interface ProductRow {
  id: number;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category_id: number | null;
  category_slug: string | null;
  category_name: string | null;
  summary: string;
  description: string;
  cost_price: number;
  price: number;
  compare_at_price: number;
  stock: number;
  low_stock_threshold: number;
  moq: number;
  units_sold: number;
  image_url: string;
  gallery: string;
  specs: string;
  tags: string;
  status: string;
  featured: number;
  rating: number;
  review_count: number;
  /** JSON array of colour names the product is stocked in. */
  colours: string;
  /** 0 when the item is sold as-is and the return policy does not apply. */
  returnable: number;
  created_at: number;
  updated_at: number;
  profit_per_unit: number;
  margin_pct: number;
  markup_pct: number;
  discount_pct: number;
  stock_value: number;
  retail_value: number;
  stock_state: 'ok' | 'low' | 'out';
}

export const PRODUCT_COLUMNS = `
  p.id, p.sku, p.slug, p.name, p.brand, p.category_id, p.summary, p.description,
  p.cost_price, p.price, p.compare_at_price, p.stock, p.low_stock_threshold, p.moq,
  p.units_sold, p.image_url, p.gallery, p.specs, p.tags, p.status, p.featured,
  p.rating, p.review_count, p.colours, p.returnable, p.created_at, p.updated_at,
  p.profit_per_unit, p.margin_pct, p.markup_pct, p.discount_pct,
  p.stock_value, p.retail_value, p.stock_state,
  c.slug AS category_slug, c.name AS category_name
`;

/** Public product shape — deliberately omits cost and margin. */
export function toPublicProduct(row: ProductRow, tiers: PriceTier[] = []) {
  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category_slug
      ? { slug: row.category_slug, name: row.category_name ?? row.category_slug }
      : null,
    summary: row.summary,
    description: row.description,
    price: row.price,
    compare_at_price: row.compare_at_price,
    discount_pct: row.discount_pct,
    moq: row.moq,
    stock: row.stock,
    stock_state: row.stock_state,
    in_stock: row.stock > 0,
    image_url: row.image_url,
    gallery: parseJsonColumn<string[]>(row.gallery, []),
    specs: parseJsonColumn<Record<string, string>>(row.specs, {}),
    tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    featured: row.featured === 1,
    rating: row.rating,
    review_count: row.review_count,
    colours: parseJsonColumn<string[]>(row.colours, []),
    // Shown on the product page so a shopper knows before buying, not after.
    returnable: row.returnable === 1,
    units_sold: row.units_sold,
    tiers,
    /** Cheapest achievable unit price, used for "from ৳X" labels. */
    min_price: tiers.length ? Math.min(row.price, ...tiers.map((t) => t.unit_price)) : row.price,
  };
}

/** Admin product shape — the full record including cost and derived margin. */
export function toAdminProduct(row: ProductRow, tiers: PriceTier[] = []) {
  return {
    ...toPublicProduct(row, tiers),
    status: row.status,
    cost_price: row.cost_price,
    profit_per_unit: row.profit_per_unit,
    margin_pct: row.margin_pct,
    markup_pct: row.markup_pct,
    stock_value: row.stock_value,
    retail_value: row.retail_value,
    low_stock_threshold: row.low_stock_threshold,
    category_id: row.category_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function loadTiers(env: Env, productIds: number[]): Promise<Map<number, PriceTier[]>> {
  const map = new Map<number, PriceTier[]>();
  if (productIds.length === 0) return map;

  const placeholders = productIds.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT product_id, min_qty, unit_price FROM price_tiers
      WHERE product_id IN (${placeholders}) ORDER BY min_qty ASC`,
  )
    .bind(...productIds)
    .all<{ product_id: number; min_qty: number; unit_price: number }>();

  for (const row of results ?? []) {
    const list = map.get(row.product_id) ?? [];
    list.push({ min_qty: row.min_qty, unit_price: row.unit_price });
    map.set(row.product_id, list);
  }
  return map;
}

export async function getSettings(env: Env): Promise<StoreSettings> {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{
    key: string;
    value: string;
  }>();
  return parseSettings(results ?? []);
}

/**
 * Settings a visitor is allowed to see.
 *
 * An allow-list rather than the whole table, because `settings` also holds the
 * courier keys and the payment numbers' internal notes. Both public endpoints
 * read this one list, so a key added for the shop cannot arrive on one page
 * and be missing on another — which is exactly how the invoice ended up with
 * a WhatsApp line the API never sent it.
 */
const PUBLIC_SETTING_KEYS = [
  'store_name',
  'legal_name',
  'store_tagline',
  'support_phone',
  'support_phone_2',
  'support_email',
  'support_whatsapp_url',
  'store_address',
  'whatsapp_number',
  'credit_dev_name',
  'credit_dev_url',
  'credit_author_name',
  'credit_author_url',
  'owner_name',
  'facebook_url',
  'bkash_number',
  'nagad_number',
  'rocket_number',
  'bank_details',
  'order_whatsapp',
] as const;

export async function getPublicSettings(env: Env): Promise<StoreSettings & Record<string, string>> {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{
    key: string;
    value: string;
  }>();
  const rows = results ?? [];
  const allowed = new Set<string>(PUBLIC_SETTING_KEYS);
  const info = Object.fromEntries(rows.filter((r) => allowed.has(r.key)).map((r) => [r.key, r.value]));
  return { ...parseSettings(rows), ...info } as StoreSettings & Record<string, string>;
}
