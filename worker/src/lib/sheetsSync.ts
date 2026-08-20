/**
 * Fills the owner's connected Google Sheet with real data: three tabs
 * (Users, Orders, Revenue), each fully replaced on every run — by the
 * "Sync now" button in Settings, or automatically once an hour from the
 * Worker's cron trigger (see index.ts). Money is written as plain numbers
 * in taka, not pre-formatted strings, so SUM()/charts/pivot tables in the
 * sheet actually work on it.
 */

import type { Env } from '../types';
import { parseSpreadsheetId, syncSpreadsheet, type SheetPage } from './googleSheets';

const taka = (poisha: number): number => Math.round((poisha / 100) * 100) / 100;
const isoDate = (unix: number | null): string => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : '');

interface CustomerRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  city: string;
  created_at: number;
  last_login_at: number | null;
  active: number;
  orders: number;
  spent: number;
}

interface OrderRow {
  order_no: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  status: string;
  payment_method: string;
  total: number;
  created_at: number;
}

interface RevenueRow {
  day: string;
  orders: number;
  revenue: number;
  profit: number;
}

async function usersPage(env: Env): Promise<SheetPage> {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.phone, c.email, c.city, c.created_at, c.last_login_at, c.active,
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders,
            (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.customer_id = c.id AND o.counts_as_sale = 1) AS spent
       FROM customers c
      ORDER BY c.created_at DESC
      LIMIT 2000`,
  ).all<CustomerRow>();

  const rows = (results ?? []).map((r) => [
    r.id,
    r.name,
    r.phone,
    r.email,
    r.city,
    r.orders,
    taka(r.spent),
    r.active ? 'Active' : 'Blocked',
    isoDate(r.created_at),
    isoDate(r.last_login_at),
  ]);

  return {
    title: 'Users',
    rows: [['ID', 'Name', 'Phone', 'Email', 'City', 'Orders', 'Total spent (৳)', 'Status', 'Joined', 'Last sign-in'], ...rows],
  };
}

async function ordersPage(env: Env): Promise<SheetPage> {
  const { results } = await env.DB.prepare(
    `SELECT order_no, customer_name, customer_phone, city, status, payment_method, total, created_at
       FROM orders
      ORDER BY created_at DESC
      LIMIT 2000`,
  ).all<OrderRow>();

  const rows = (results ?? []).map((r) => [
    r.order_no,
    r.customer_name,
    r.customer_phone,
    r.city,
    r.status,
    r.payment_method.toUpperCase(),
    taka(r.total),
    isoDate(r.created_at),
  ]);

  return {
    title: 'Orders',
    rows: [['Order No', 'Customer', 'Phone', 'City', 'Status', 'Payment', 'Total (৳)', 'Date'], ...rows],
  };
}

async function revenuePage(env: Env): Promise<SheetPage> {
  const { results } = await env.DB.prepare(
    `SELECT date(created_at, 'unixepoch') AS day,
            COUNT(*) AS orders,
            COALESCE(SUM(total), 0) AS revenue,
            COALESCE(SUM(profit), 0) AS profit
       FROM orders
      WHERE counts_as_sale = 1 AND created_at >= strftime('%s', 'now', '-90 days')
      GROUP BY day
      ORDER BY day DESC`,
  ).all<RevenueRow>();

  const rows = (results ?? []).map((r) => [r.day, r.orders, taka(r.revenue), taka(r.profit)]);

  return {
    title: 'Revenue',
    rows: [['Date', 'Orders', 'Revenue (৳)', 'Gross profit (৳)'], ...rows],
  };
}

export interface SheetsSyncResult {
  ok: boolean;
  error: string;
  synced_at: number | null;
}

/** Reads the connected spreadsheet ID from settings and pushes fresh data into it. */
export async function runSheetsSync(env: Env): Promise<SheetsSyncResult> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'sheets_spreadsheet_id'").first<{ value: string }>();
  const id = row?.value ? parseSpreadsheetId(row.value) : null;
  if (!id) {
    return { ok: false, error: 'No Google Sheet connected yet — paste its link in Settings → Analytics.', synced_at: null };
  }

  const [users, orders, revenue] = await Promise.all([usersPage(env), ordersPage(env), revenuePage(env)]);
  const result = await syncSpreadsheet(env, id, [users, orders, revenue]);

  const now = Math.floor(Date.now() / 1000);
  if (result.ok) {
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('sheets_last_synced_at', ?, strftime('%s','now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind(String(now))
      .run();
    await env.DB.prepare("DELETE FROM settings WHERE key = 'sheets_last_error'").run();
    return { ok: true, error: '', synced_at: now };
  }

  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('sheets_last_error', ?, strftime('%s','now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(result.error.slice(0, 500))
    .run();
  return { ok: false, error: result.error, synced_at: null };
}
