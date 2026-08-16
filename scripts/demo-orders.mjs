#!/usr/bin/env node
/**
 * Places a handful of realistic orders so a fresh install has something to
 * show on the dashboard.
 *
 *   node scripts/demo-orders.mjs <baseUrl> <adminUsername> <adminPassword> [count]
 *
 * Orders go through the public checkout endpoint, so stock, the ledger and the
 * analytics rollups all move exactly as they would for a real customer. A
 * mix of statuses is applied afterwards. Development and demo use only.
 */

const [, , baseArg, username, password, countArg] = process.argv;
const BASE = (baseArg ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const COUNT = Number(countArg) || 12;

if (!username || !password) {
  console.error('Usage: node scripts/demo-orders.mjs <baseUrl> <adminUsername> <adminPassword> [count]');
  process.exit(1);
}

const NAMES = [
  'Rashed Karim', 'Nusrat Jahan', 'Imran Hossain', 'Tanvir Ahmed', 'Sadia Rahman',
  'Mahmudul Hasan', 'Farhana Akter', 'Shakib Al Amin', 'Rumana Begum', 'Arif Chowdhury',
  'Jubayer Islam', 'Mitu Sultana',
];
const CITIES = ['Dhaka', 'Chattogram', 'Sylhet', 'Khulna', 'Rajshahi', 'Narayanganj', 'Cumilla'];
const PAYMENTS = ['cod', 'bkash', 'nagad', 'bank'];
// Weighted so most orders progress and only a few reverse.
const OUTCOMES = ['delivered', 'delivered', 'delivered', 'shipped', 'shipped', 'packed', 'confirmed', 'pending', 'cancelled'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

async function json(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${parsed?.error ?? text}`);
  return parsed;
}

const login = await json('/api/admin/login', { method: 'POST', body: { username, password } });
const token = login.token;

const catalogue = await json('/api/products?limit=60&in_stock=1');
const products = catalogue.products.filter((p) => p.stock > 0);
if (products.length === 0) {
  console.error('No products in stock — run the migrations first.');
  process.exit(1);
}

console.log(`Placing ${COUNT} demo orders against ${BASE}\n`);
let placed = 0;

for (let i = 0; i < COUNT; i++) {
  const lineCount = 1 + Math.floor(Math.random() * 3);
  const chosen = new Map();

  for (let n = 0; n < lineCount; n++) {
    const product = pick(products);
    if (chosen.has(product.id)) continue;
    // Weight toward the MOQ so demo orders don't drain the shelf.
    const qty = product.moq * (1 + Math.floor(Math.random() * 3));
    if (qty > product.stock) continue;
    chosen.set(product.id, qty);
  }
  if (chosen.size === 0) continue;

  const name = pick(NAMES);
  try {
    const created = await json('/api/orders', {
      method: 'POST',
      body: {
        customer_name: name,
        customer_phone: `017${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`,
        customer_email: `${name.split(' ')[0].toLowerCase()}@example.com`,
        address: `House ${1 + Math.floor(Math.random() * 90)}, Road ${1 + Math.floor(Math.random() * 20)}`,
        city: pick(CITIES),
        payment_method: pick(PAYMENTS),
        items: [...chosen].map(([product_id, qty]) => ({ product_id, qty })),
      },
    });

    const orderNo = created.order.order_no;
    const outcome = pick(OUTCOMES);

    if (outcome !== 'pending') {
      const found = await json(`/api/admin/orders?q=${orderNo}`, { token });
      const row = found.orders[0];
      if (row) await json(`/api/admin/orders/${row.id}`, { method: 'PATCH', token, body: { status: outcome } });
    }

    placed++;
    console.log(`  ${orderNo}  ${String(outcome).padEnd(10)} ${name}`);
  } catch (err) {
    console.log(`  skipped — ${err.message}`);
  }
}

console.log(`\nDone. ${placed} orders created.`);
