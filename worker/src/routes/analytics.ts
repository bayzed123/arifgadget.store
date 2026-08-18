import { Hono } from 'hono';
import type { Env, Variables } from '../types';

/**
 * Every figure here is derived live from `orders`, `order_items` and
 * `stock_movements`. Nothing is cached or hand-maintained, so the dashboard
 * can never disagree with the ledger.
 */
export const analytics = new Hono<{ Bindings: Env; Variables: Variables }>();

function days(c: { req: { url: string } }, fallback = 30): number {
  const raw = Number(new URL(c.req.url).searchParams.get('days'));
  return Math.min(Math.max(Number.isFinite(raw) && raw > 0 ? raw : fallback, 1), 365);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // null = "no baseline"
  return Math.round(((current - previous) * 10000) / previous) / 100;
}

interface PeriodTotals {
  orders: number;
  units: number;
  revenue: number;
  net_sales: number;
  cost: number;
  profit: number;
  customers: number;
}

/**
 * Upper bound for the *current* window. A Worker's `Date.now()` is pinned to
 * its last I/O, so it can read a second or two behind the clock D1 stamps rows
 * with — a literal `now` bound would silently drop the newest orders. Nothing
 * can be created in the future, so leaving the window open-ended is both safe
 * and more accurate.
 */
const OPEN_ENDED = 9_999_999_999;

const PERIOD_SQL = `
  SELECT COUNT(DISTINCT o.id)                                   AS orders,
         COALESCE(SUM(li.units), 0)                             AS units,
         COALESCE(SUM(o.total), 0)                              AS revenue,
         COALESCE(SUM(o.subtotal - o.discount), 0)              AS net_sales,
         COALESCE(SUM(o.cost_total), 0)                         AS cost,
         COALESCE(SUM(o.profit), 0)                             AS profit,
         COUNT(DISTINCT o.customer_phone)                       AS customers
    FROM orders o
    LEFT JOIN (SELECT order_id, SUM(qty) AS units FROM order_items GROUP BY order_id) li
           ON li.order_id = o.id
   WHERE o.counts_as_sale = 1
     AND o.created_at >= ? AND o.created_at < ?
`;

analytics.get('/overview', async (c) => {
  const window = days(c);
  const now = Math.floor(Date.now() / 1000);
  const spanSeconds = window * 86400;
  const currentFrom = now - spanSeconds;
  const previousFrom = currentFrom - spanSeconds;

  const [current, previous, pipeline, inventory, catalogue] = await Promise.all([
    c.env.DB.prepare(PERIOD_SQL).bind(currentFrom, OPEN_ENDED).first<PeriodTotals>(),
    c.env.DB.prepare(PERIOD_SQL).bind(previousFrom, currentFrom).first<PeriodTotals>(),
    c.env.DB.prepare(
      `SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS value
         FROM orders GROUP BY status`,
    ).all<{ status: string; n: number; value: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(stock), 0)              AS stock_units,
              COALESCE(SUM(stock * cost_price), 0) AS stock_cost_value,
              COALESCE(SUM(stock * price), 0)      AS stock_retail_value,
              SUM(CASE WHEN stock_state = 'low' THEN 1 ELSE 0 END) AS low_stock,
              SUM(CASE WHEN stock_state = 'out' THEN 1 ELSE 0 END) AS out_of_stock
         FROM products WHERE status = 'active'`,
    ).first<{
      stock_units: number;
      stock_cost_value: number;
      stock_retail_value: number;
      low_stock: number;
      out_of_stock: number;
    }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'active'   THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN status = 'draft'    THEN 1 ELSE 0 END) AS draft,
              SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
              SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END)     AS updated_in_period
         FROM products`,
    )
      .bind(currentFrom)
      .first<{ total: number; active: number; draft: number; archived: number; updated_in_period: number }>(),
  ]);

  const cur = current ?? ({ orders: 0, units: 0, revenue: 0, net_sales: 0, cost: 0, profit: 0, customers: 0 } as PeriodTotals);
  const prev = previous ?? ({ orders: 0, units: 0, revenue: 0, net_sales: 0, cost: 0, profit: 0, customers: 0 } as PeriodTotals);

  const aov = cur.orders > 0 ? Math.round(cur.revenue / cur.orders) : 0;
  const prevAov = prev.orders > 0 ? Math.round(prev.revenue / prev.orders) : 0;

  const byStatus = Object.fromEntries((pipeline.results ?? []).map((r) => [r.status, { count: r.n, value: r.value }]));
  const inv = inventory!;

  return c.json({
    period_days: window,
    sales: {
      revenue: cur.revenue,
      net_sales: cur.net_sales,
      cost: cur.cost,
      profit: cur.profit,
      margin_pct: cur.net_sales > 0 ? Math.round((cur.profit * 10000) / cur.net_sales) / 100 : 0,
      orders: cur.orders,
      units: cur.units,
      customers: cur.customers,
      aov,
    },
    change: {
      revenue: pctChange(cur.revenue, prev.revenue),
      profit: pctChange(cur.profit, prev.profit),
      orders: pctChange(cur.orders, prev.orders),
      units: pctChange(cur.units, prev.units),
      aov: pctChange(aov, prevAov),
    },
    previous: { revenue: prev.revenue, profit: prev.profit, orders: prev.orders, units: prev.units, aov: prevAov },
    pipeline: byStatus,
    inventory: {
      stock_units: inv.stock_units,
      stock_cost_value: inv.stock_cost_value,
      stock_retail_value: inv.stock_retail_value,
      // profit still sitting on the shelf if everything sells at list price
      unrealised_profit: inv.stock_retail_value - inv.stock_cost_value,
      low_stock: inv.low_stock ?? 0,
      out_of_stock: inv.out_of_stock ?? 0,
    },
    catalogue: catalogue!,
  });
});

/** Zero-filled daily series so charts don't skip quiet days. */
analytics.get('/timeseries', async (c) => {
  const window = days(c);
  const { results } = await c.env.DB.prepare(
    `WITH RECURSIVE span(d) AS (
        SELECT date('now', ?)
        UNION ALL
        SELECT date(d, '+1 day') FROM span WHERE d < date('now')
     )
     SELECT span.d                                          AS day,
            COUNT(DISTINCT o.id)                            AS orders,
            COALESCE(SUM(o.total), 0)                       AS revenue,
            COALESCE(SUM(o.cost_total), 0)                  AS cost,
            COALESCE(SUM(o.profit), 0)                      AS profit
       FROM span
       LEFT JOIN orders o
              ON date(o.created_at, 'unixepoch') = span.d
             AND o.counts_as_sale = 1
      GROUP BY span.d
      ORDER BY span.d ASC`,
  )
    .bind(`-${window - 1} days`)
    .all<{ day: string; orders: number; revenue: number; cost: number; profit: number }>();

  const series = results ?? [];

  // Units need their own pass: joining order_items into the query above would
  // multiply the order-level money columns by the line count.
  const { results: unitRows } = await c.env.DB.prepare(
    `SELECT date(o.created_at, 'unixepoch') AS day, COALESCE(SUM(oi.qty), 0) AS units
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE o.counts_as_sale = 1 AND o.created_at >= strftime('%s', date('now', ?))
      GROUP BY day`,
  )
    .bind(`-${window - 1} days`)
    .all<{ day: string; units: number }>();

  const units = new Map((unitRows ?? []).map((r) => [r.day, r.units]));

  return c.json({
    period_days: window,
    series: series.map((row) => ({ ...row, units: units.get(row.day) ?? 0 })),
  });
});

analytics.get('/top-products', async (c) => {
  const window = days(c);
  const limit = Math.min(Math.max(Number(new URL(c.req.url).searchParams.get('limit')) || 10, 1), 50);
  const from = Math.floor(Date.now() / 1000) - window * 86400;

  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.sku, p.name, p.image_url, p.stock, p.stock_state, p.price,
            COALESCE(SUM(oi.qty), 0)                                  AS units,
            COALESCE(SUM(oi.qty * oi.unit_price), 0)                  AS revenue,
            COALESCE(SUM(oi.qty * (oi.unit_price - oi.unit_cost)), 0) AS profit
       FROM order_items oi
       JOIN orders o   ON o.id = oi.order_id AND o.counts_as_sale = 1 AND o.created_at >= ?
       JOIN products p ON p.id = oi.product_id
      GROUP BY p.id
      ORDER BY revenue DESC
      LIMIT ?`,
  )
    .bind(from, limit)
    .all();

  return c.json({ period_days: window, products: results ?? [] });
});

analytics.get('/categories', async (c) => {
  const window = days(c);
  const from = Math.floor(Date.now() / 1000) - window * 86400;

  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.slug, c.name, c.icon,
            COUNT(DISTINCT p.id)                                      AS skus,
            COALESCE(SUM(oi.qty), 0)                                  AS units,
            COALESCE(SUM(oi.qty * oi.unit_price), 0)                  AS revenue,
            COALESCE(SUM(oi.qty * (oi.unit_price - oi.unit_cost)), 0) AS profit
       FROM categories c
       LEFT JOIN products p    ON p.category_id = c.id
       LEFT JOIN order_items oi ON oi.product_id = p.id
       LEFT JOIN orders o       ON o.id = oi.order_id AND o.counts_as_sale = 1 AND o.created_at >= ?
      GROUP BY c.id
      ORDER BY revenue DESC`,
  )
    .bind(from)
    .all();

  return c.json({ period_days: window, categories: results ?? [] });
});

/** Restock queue: what's out, what's nearly out, and what hasn't moved. */
analytics.get('/inventory', async (c) => {
  const window = days(c);
  const from = Math.floor(Date.now() / 1000) - window * 86400;

  const [{ results: alerts }, { results: dead }, { results: movements }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, sku, name, image_url, stock, low_stock_threshold, stock_state, moq,
              cost_price, price, stock * cost_price AS tied_up
         FROM products
        WHERE status = 'active' AND stock_state IN ('low','out')
        ORDER BY stock ASC, name ASC
        LIMIT 50`,
    ).all(),
    c.env.DB.prepare(
      `SELECT p.id, p.sku, p.name, p.stock, p.stock * p.cost_price AS tied_up, p.updated_at
         FROM products p
        WHERE p.status = 'active' AND p.stock > 0
          AND NOT EXISTS (
            SELECT 1 FROM order_items oi
              JOIN orders o ON o.id = oi.order_id AND o.counts_as_sale = 1
             WHERE oi.product_id = p.id AND o.created_at >= ?
          )
        ORDER BY tied_up DESC
        LIMIT 20`,
    )
      .bind(from)
      .all(),
    c.env.DB.prepare(
      `SELECT sm.id, sm.product_id, p.name, p.sku, sm.delta, sm.reason, sm.balance_after,
              sm.note, sm.actor, sm.created_at
         FROM stock_movements sm JOIN products p ON p.id = sm.product_id
        ORDER BY sm.id DESC LIMIT 40`,
    ).all(),
  ]);

  return c.json({
    period_days: window,
    alerts: alerts ?? [],
    dead_stock: dead ?? [],
    recent_movements: movements ?? [],
  });
});

/**
 * Courier performance: how many parcels arrived, how many came back, and where
 * the cash on delivery stands.
 *
 * The counts are read from `courier_status` — the courier's own word — rather
 * than from the shop's checkpoints, because the two legitimately disagree for a
 * while. A parcel Steadfast has marked delivered but not yet approved is real
 * money in transit that the shop's own status has correctly not recognised yet,
 * and hiding that gap would make the figures useless for chasing payment.
 *
 * Only cash-on-delivery orders carry a COD amount, so "collected" and
 * "outstanding" are about cash the courier owes the shop — not about revenue,
 * which the sales reports already cover.
 */
analytics.get('/courier', async (c) => {
  const window = days(c);
  const from = Math.floor(Date.now() / 1000) - window * 86400;

  const summary = await c.env.DB.prepare(
    `SELECT
       COUNT(*)                                                              AS booked,
       SUM(CASE WHEN courier_status IN ('delivered','partial_delivered')
                THEN 1 ELSE 0 END)                                           AS delivered,
       SUM(CASE WHEN courier_status = 'cancelled' THEN 1 ELSE 0 END)         AS returned,
       SUM(CASE WHEN courier_status IN ('pending','in_review','hold')
                THEN 1 ELSE 0 END)                                           AS in_transit,
       SUM(CASE WHEN courier_status LIKE '%_approval' THEN 1 ELSE 0 END)     AS awaiting_approval,
       COALESCE(SUM(courier_cod_amount), 0)                                  AS cod_booked,
       COALESCE(SUM(CASE WHEN courier_status IN ('delivered','partial_delivered')
                         THEN courier_cod_amount ELSE 0 END), 0)             AS cod_collected,
       COALESCE(SUM(CASE WHEN courier_status NOT IN ('delivered','partial_delivered','cancelled')
                         THEN courier_cod_amount ELSE 0 END), 0)             AS cod_outstanding
     FROM orders
    WHERE consignment_id <> '' AND created_at >= ? AND created_at < ?`,
  )
    .bind(from, OPEN_ENDED)
    .first<Record<string, number>>();

  const booked = summary?.booked ?? 0;
  const delivered = summary?.delivered ?? 0;
  const returned = summary?.returned ?? 0;
  const settled = delivered + returned;

  const { results: recent } = await c.env.DB.prepare(
    `SELECT id, order_no, customer_name, customer_phone, city, status, total,
            courier_status, tracking_code, consignment_id, courier_cod_amount, courier_synced_at
       FROM orders
      WHERE consignment_id <> ''
      ORDER BY created_at DESC
      LIMIT 30`,
  ).all();

  return c.json({
    period_days: window,
    booked,
    delivered,
    returned,
    in_transit: summary?.in_transit ?? 0,
    awaiting_approval: summary?.awaiting_approval ?? 0,
    // Share of parcels that reached the customer, counting only those the
    // courier has actually finished with. Measuring against every booked parcel
    // would drag the rate down purely because today's deliveries are still out.
    success_rate: settled > 0 ? Math.round((delivered / settled) * 1000) / 10 : 0,
    return_rate: settled > 0 ? Math.round((returned / settled) * 1000) / 10 : 0,
    cod_booked: summary?.cod_booked ?? 0,
    cod_collected: summary?.cod_collected ?? 0,
    cod_outstanding: summary?.cod_outstanding ?? 0,
    parcels: recent ?? [],
  });
});
