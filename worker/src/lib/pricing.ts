/**
 * Pricing maths. Every amount is an integer in minor units (poisha) so that
 * repeated arithmetic never accumulates floating-point error.
 */

export interface PriceTier {
  min_qty: number;
  unit_price: number;
}

/** Delivery is priced by zone: inside Dhaka is cheaper than the rest of the country. */
export type DeliveryZone = 'dhaka' | 'outside';

export const DELIVERY_ZONES: DeliveryZone[] = ['dhaka', 'outside'];

/** Anything unrecognised falls back to the safer, higher rate. */
export function parseZone(value: unknown): DeliveryZone {
  return value === 'dhaka' ? 'dhaka' : 'outside';
}

export interface StoreSettings {
  shipping_dhaka: number;
  shipping_outside: number;
  free_shipping_over: number;
  tax_pct: number;
  currency: string;
  currency_symbol: string;
}

export const DEFAULT_SETTINGS: StoreSettings = {
  shipping_dhaka: 9000,
  shipping_outside: 13000,
  free_shipping_over: 500000,
  tax_pct: 0,
  currency: 'BDT',
  currency_symbol: '৳',
};

/** The courier charge for a zone, before any free-delivery threshold. */
export function shippingRate(settings: StoreSettings, zone: DeliveryZone): number {
  return zone === 'dhaka' ? settings.shipping_dhaka : settings.shipping_outside;
}

/**
 * Alibaba-style volume pricing: pick the best tier the quantity qualifies for.
 * Falls back to the product's base price when no tier applies.
 */
export function unitPriceFor(basePrice: number, tiers: PriceTier[], qty: number): number {
  let price = basePrice;
  let bestMin = 0;
  for (const tier of tiers) {
    if (qty >= tier.min_qty && tier.min_qty >= bestMin) {
      bestMin = tier.min_qty;
      price = tier.unit_price;
    }
  }
  return price;
}

export interface CartLineInput {
  product_id: number;
  qty: number;
  base_price: number;
  cost_price: number;
  moq: number;
  tiers: PriceTier[];
}

export interface CartLine {
  product_id: number;
  qty: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  line_cost: number;
  line_profit: number;
  /** How much the volume tier saved against the base price. */
  tier_savings: number;
}

export interface CartTotals {
  lines: CartLine[];
  subtotal: number;
  cost_total: number;
  tier_savings: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  profit: number;
  margin_pct: number;
  units: number;
  delivery_zone: DeliveryZone;
  free_shipping_applied: boolean;
  /** Minor units still needed to unlock free shipping, 0 once unlocked. */
  free_shipping_gap: number;
}

export function computeCart(
  inputs: CartLineInput[],
  settings: StoreSettings,
  discount = 0,
  zone: DeliveryZone = 'outside',
): CartTotals {
  const lines: CartLine[] = inputs.map((input) => {
    const qty = Math.max(input.qty, input.moq);
    const unit_price = unitPriceFor(input.base_price, input.tiers, qty);
    return {
      product_id: input.product_id,
      qty,
      unit_price,
      unit_cost: input.cost_price,
      line_total: qty * unit_price,
      line_cost: qty * input.cost_price,
      line_profit: qty * (unit_price - input.cost_price),
      tier_savings: qty * (input.base_price - unit_price),
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.line_total, 0);
  const cost_total = lines.reduce((sum, l) => sum + l.line_cost, 0);
  const tier_savings = lines.reduce((sum, l) => sum + l.tier_savings, 0);
  const units = lines.reduce((sum, l) => sum + l.qty, 0);

  const cappedDiscount = Math.min(Math.max(discount, 0), subtotal);
  const net = subtotal - cappedDiscount;

  const free_shipping_applied = net >= settings.free_shipping_over && net > 0;
  const shipping = net === 0 || free_shipping_applied ? 0 : shippingRate(settings, zone);
  const tax = Math.round((net * settings.tax_pct) / 100);
  const total = net + shipping + tax;
  const profit = net - cost_total;

  return {
    lines,
    subtotal,
    cost_total,
    tier_savings,
    discount: cappedDiscount,
    shipping,
    tax,
    total,
    profit,
    margin_pct: net > 0 ? Math.round((profit * 10000) / net) / 100 : 0,
    units,
    delivery_zone: zone,
    free_shipping_applied,
    free_shipping_gap: free_shipping_applied ? 0 : Math.max(settings.free_shipping_over - net, 0),
  };
}

export function parseSettings(rows: { key: string; value: string }[]): StoreSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const parsed = Number(map.get(key));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    // shipping_flat is the pre-zone setting; it seeds both rates if a shop
    // upgraded before the zone settings were written.
    shipping_dhaka: num('shipping_dhaka', num('shipping_flat', DEFAULT_SETTINGS.shipping_dhaka)),
    shipping_outside: num('shipping_outside', num('shipping_flat', DEFAULT_SETTINGS.shipping_outside)),
    free_shipping_over: num('free_shipping_over', DEFAULT_SETTINGS.free_shipping_over),
    tax_pct: num('tax_pct', DEFAULT_SETTINGS.tax_pct),
    currency: map.get('currency') ?? DEFAULT_SETTINGS.currency,
    currency_symbol: map.get('currency_symbol') ?? DEFAULT_SETTINGS.currency_symbol,
  };
}
