export interface Tier {
  min_qty: number;
  unit_price: number;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  icon: string;
  product_count?: number;
}

export interface Product {
  id: number;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: { slug: string; name: string } | null;
  summary: string;
  description: string;
  price: number;
  compare_at_price: number;
  discount_pct: number;
  moq: number;
  stock: number;
  stock_state: 'ok' | 'low' | 'out';
  in_stock: boolean;
  image_url: string;
  gallery: string[];
  specs: Record<string, string>;
  tags: string[];
  featured: boolean;
  rating: number;
  review_count: number;
  /** Colour names this product is stocked in; empty when it has no variants. */
  colours: string[];
  /** False for clearance and sealed lines the return policy does not cover. */
  returnable: boolean;
  units_sold: number;
  tiers: Tier[];
  min_price: number;
}

export interface AdminProduct extends Product {
  status: 'active' | 'draft' | 'archived';
  cost_price: number;
  profit_per_unit: number;
  margin_pct: number;
  markup_pct: number;
  stock_value: number;
  retail_value: number;
  low_stock_threshold: number;
  category_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface StoreSettings {
  currency: string;
  currency_symbol: string;
  bkash_number?: string;
  nagad_number?: string;
  rocket_number?: string;
  bank_details?: string;
  order_whatsapp?: string;
  shipping_dhaka: number;
  shipping_outside: number;
  free_shipping_over: number;
  tax_pct: number;
  store_name?: string;
  /** Registered name, used on invoices where the short brand is not enough. */
  legal_name?: string;
  store_tagline?: string;
  support_phone?: string;
  support_phone_2?: string;
  support_email?: string;
  store_address?: string;
  whatsapp_number?: string;
  /** Full https://wa.me/… link for support, so every entry point agrees. */
  support_whatsapp_url?: string;
  credit_dev_name?: string;
  credit_dev_url?: string;
  credit_author_name?: string;
  credit_author_url?: string;
  owner_name?: string;
  facebook_url?: string;
  /** Set from Settings → Homepage. Empty/absent means the bundled default banner. */
  hero_banner_url?: string;
}

export interface QuoteLine {
  product_id: number;
  sku: string;
  name: string;
  image_url: string;
  qty: number;
  moq: number;
  unit_price: number;
  line_total: number;
  tier_savings: number;
  stock: number;
  in_stock: boolean;
}

/** Delivery is priced by zone; anything unknown falls back to the higher rate. */
export type DeliveryZone = 'dhaka' | 'outside';

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  tier_savings: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  units: number;
  delivery_zone: DeliveryZone;
  free_shipping_applied: boolean;
  free_shipping_gap: number;
}

export interface AdminOrder {
  /** Receipt reference, distinct from order_no. Derived from the row id. */
  invoice_no?: string;
  payment_reference?: string;
  delivery_zone?: string;
  id: number;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  status: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  cost_total: number;
  profit: number;
  margin_pct: number;
  payment_method: string;
  created_at: number;
  units: number;
  /** Courier fields. Empty until the order is booked with Steadfast. */
  courier?: string;
  consignment_id?: string;
  tracking_code?: string;
  courier_status?: string;
  courier_cod_amount?: number;
  courier_synced_at?: number | null;
}

/**
 * What the API can tell the dashboard about the Steadfast connection.
 *
 * `reason` exists so the UI can say something useful. "Not connected" alone
 * covers four different problems with four different fixes, and staring at a
 * red badge does not tell you which one you have.
 */
export interface CourierConnection {
  connected: boolean;
  balance: number | null;
  reason: 'ok' | 'not_configured' | 'rejected' | 'courier_down' | 'unreachable';
  /** The courier's HTTP status, when there was one. */
  status?: number | null;
  /** Steadfast's own words, verbatim. */
  message: string;
  /** What to do about it, in plain English. */
  fix: string;
  credentials: {
    api_key_present: boolean;
    secret_key_present: boolean;
    /** Length only — never any part of the value. */
    api_key_length: number;
    secret_key_length: number;
    base_url: string;
    /** Which account this is — the label staff gave it, or "Deploy secret" for the legacy env-var account. */
    account_label: string;
    source: 'dashboard' | 'legacy' | 'none';
  };
}

/**
 * One Steadfast account, as added from Settings → Courier accounts. The shop
 * can hold several — only one is ever active (used for every live courier
 * call) at a time. Never carries the key itself, only whether one is set and
 * how long it is.
 */
export interface CourierAccount {
  id: number;
  provider: string;
  label: string;
  api_key_present: boolean;
  secret_key_present: boolean;
  api_key_length: number;
  secret_key_length: number;
  base_url: string;
  active: boolean;
  created_at: number;
  updated_at: number;
}

/** One COD remittance Steadfast has actually paid the shop — real money, not the running balance. */
export interface CourierPayment {
  reference: string;
  amount: number;
  status: string;
  note: string;
  paidAt: string;
}

/**
 * Everything stored about one order, as returned when a single order is opened.
 *
 * The delivery fields are deliberately not in the list response: a page of
 * forty orders would then carry forty customers' addresses and phone numbers
 * into the browser whether or not anyone looked at them. They arrive only when
 * a staff member opens the order they are working on.
 */
export interface OrderDetail extends AdminOrder {
  address: string;
  customer_email: string;
  note: string;
}

export interface OrderItem {
  id: number;
  product_id: number | null;
  sku: string;
  name: string;
  image_url: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  line_cost: number;
  line_profit: number;
  colour?: string;
}

export interface StockMovement {
  id: number;
  product_id?: number;
  name?: string;
  sku?: string;
  delta: number;
  reason: string;
  ref_type: string;
  ref_id: number | null;
  balance_after: number;
  unit_cost: number;
  note: string;
  actor: string;
  created_at: number;
}

export interface Overview {
  period_days: number;
  sales: {
    revenue: number;
    net_sales: number;
    cost: number;
    profit: number;
    margin_pct: number;
    orders: number;
    units: number;
    customers: number;
    aov: number;
  };
  change: {
    revenue: number | null;
    profit: number | null;
    orders: number | null;
    units: number | null;
    aov: number | null;
  };
  previous: { revenue: number; profit: number; orders: number; units: number; aov: number };
  pipeline: Record<string, { count: number; value: number }>;
  inventory: {
    stock_units: number;
    stock_cost_value: number;
    stock_retail_value: number;
    unrealised_profit: number;
    low_stock: number;
    out_of_stock: number;
  };
  catalogue: { total: number; active: number; draft: number; archived: number; updated_in_period: number };
}

export interface SeriesPoint {
  day: string;
  orders: number;
  revenue: number;
  cost: number;
  profit: number;
  units: number;
}

export interface TopProduct {
  id: number;
  sku: string;
  name: string;
  image_url: string;
  stock: number;
  stock_state: string;
  price: number;
  units: number;
  revenue: number;
  profit: number;
}

export interface CategoryStat {
  id: number;
  slug: string;
  name: string;
  icon: string;
  skus: number;
  units: number;
  revenue: number;
  profit: number;
}

export interface InventoryAlert {
  id: number;
  sku: string;
  name: string;
  image_url: string;
  stock: number;
  low_stock_threshold: number;
  stock_state: 'low' | 'out';
  moq: number;
  cost_price: number;
  price: number;
  tied_up: number;
}

export interface AdminUser {
  id?: number;
  sub?: number;
  email: string;
  username: string;
  name: string;
  role: 'owner' | 'admin' | 'staff';
}

export interface PageLink {
  slug: string;
  title: string;
  section: 'company' | 'policy' | 'hidden';
  summary: string;
}

export interface ContentPage extends PageLink {
  body: string;
  updated_at: number;
}

export interface PostSummary {
  slug: string;
  title: string;
  excerpt: string;
  cover_url: string;
  author?: string;
  tags?: string;
  published_at: number;
}

export interface Post extends PostSummary {
  body: string;
  updated_at: number;
}

export interface PressItem {
  id: number;
  title: string;
  outlet: string;
  url: string;
  thumbnail_url: string;
  excerpt: string;
  published_at: number;
  visible?: number;
  sort_order?: number;
}
