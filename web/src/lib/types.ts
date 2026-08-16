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
  shipping_flat: number;
  free_shipping_over: number;
  tax_pct: number;
  store_name?: string;
  store_tagline?: string;
  support_phone?: string;
  support_email?: string;
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

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  tier_savings: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  units: number;
  free_shipping_applied: boolean;
  free_shipping_gap: number;
}

export interface AdminOrder {
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
