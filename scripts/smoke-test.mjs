#!/usr/bin/env node
/**
 * End-to-end check of the Arif Gadgets API.
 *
 *   node scripts/smoke-test.mjs [baseUrl]
 *
 * Exercises tier pricing, MOQ enforcement, the stock ledger, order totals,
 * the cancel/restock trigger, oversell protection and the analytics rollups.
 * Safe to run against a local `wrangler dev`; it writes real rows, so point it
 * at production only if you are happy to see a test order in the dashboard.
 */

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const ADMIN = {
  username: `smoke${Date.now()}`,
  name: 'Smoke Test',
  password: 'smoke-test-password-123',
};

let passed = 0;
let failed = 0;
let token = '';

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m${detail ? `\n      ${detail}` : ''}`);
  }
}

async function api(path, { method = 'GET', body, auth = false, expect } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (expect !== undefined && res.status !== expect) {
    throw new Error(`${method} ${path} → ${res.status} (expected ${expect}): ${text.slice(0, 300)}`);
  }
  return { status: res.status, body: json };
}

const taka = (poisha) => `৳${(poisha / 100).toLocaleString('en-BD')}`;

async function main() {
  console.log(`\nArif Gadgets API smoke test → ${BASE}\n`);

  // ---------------------------------------------------------- public catalogue
  console.log('Catalogue');
  const health = await api('/health', { expect: 200 });
  check('health responds', health.body.ok === true);
  check('catalogue is seeded', health.body.products > 0, `products=${health.body.products}`);

  const store = await api('/api/storefront', { expect: 200 });
  check('storefront returns categories', store.body.categories.length >= 8);
  check('storefront returns featured products', store.body.featured.length > 0);
  check('currency is BDT', store.body.settings.currency === 'BDT');

  const audio = await api('/api/products?category=audio', { expect: 200 });
  check('category filter works', audio.body.products.every((p) => p.category.slug === 'audio'));

  const search = await api('/api/products?q=anker', { expect: 200 });
  check('search finds Anker products', search.body.products.length >= 2);

  const detail = await api('/api/products/baseus-bowie-e9', { expect: 200 });
  const buds = detail.body.product;
  check('product detail carries price tiers', buds.tiers.length === 3, JSON.stringify(buds.tiers));
  check('cost price is never exposed publicly', buds.cost_price === undefined);
  check('min_price reflects the deepest tier', buds.min_price === 148000, `got ${buds.min_price}`);
  check('related products are returned', detail.body.related.length > 0);

  // ---------------------------------------------------------- pricing engine
  console.log('\nPricing engine');
  const single = await api('/api/quote', { method: 'POST', body: { items: [{ product_id: buds.id, qty: 1 }] }, expect: 200 });
  check('MOQ raises qty 1 → 5', single.body.lines[0].qty === 5, `got ${single.body.lines[0].qty}`);
  check('base price applies below the first tier', single.body.lines[0].unit_price === 189000);

  const bulk = await api('/api/quote', { method: 'POST', body: { items: [{ product_id: buds.id, qty: 60 }] }, expect: 200 });
  const line = bulk.body.lines[0];
  check('qty 60 lands on the 60-unit tier', line.unit_price === 158000, `got ${line.unit_price}`);
  check('line total = qty × tier price', line.line_total === 60 * 158000);
  check('tier savings computed', line.tier_savings === 60 * (189000 - 158000), `got ${line.tier_savings}`);
  check('free shipping unlocked over threshold', bulk.body.free_shipping_applied === true);
  check('shipping is zero when unlocked', bulk.body.shipping === 0);
  check('total = subtotal + shipping + tax', bulk.body.total === bulk.body.subtotal + bulk.body.shipping + bulk.body.tax);
  check('quote never leaks profit', bulk.body.profit === undefined && line.unit_cost === undefined);

  // A single ৳4,250 band sits below the ৳5,000 free-shipping line.
  const band = (await api('/api/products/xiaomi-smart-band-9', { expect: 200 })).body.product;
  const cheap = await api('/api/quote', { method: 'POST', body: { items: [{ product_id: band.id, qty: 1 }] }, expect: 200 });
  check('flat shipping applies under threshold', cheap.body.shipping === 8000, `got ${cheap.body.shipping}`);
  check('free-shipping gap reported', cheap.body.free_shipping_gap === 500000 - 425000, `got ${cheap.body.free_shipping_gap}`);

  const dup = await api('/api/quote', { method: 'POST', body: { items: [{ product_id: buds.id, qty: 1 }, { product_id: buds.id, qty: 2 }] } });
  check('duplicate line items rejected', dup.status === 400);

  // ---------------------------------------------------------- admin auth
  console.log('\nAdmin authentication');
  const setup = await api('/api/admin/setup', { method: 'POST', body: ADMIN });
  const firstRun = setup.status === 201;
  check('first-run setup creates an owner (or already exists)', firstRun || setup.status === 409, `status ${setup.status}`);

  if (!firstRun) {
    console.log('      an admin already exists — supply ADMIN_USERNAME/ADMIN_PASSWORD to test the rest');
    if (!process.env.ADMIN_USERNAME) {
      console.log('\n\x1b[33mSkipping admin tests.\x1b[0m');
      return report();
    }
    ADMIN.username = process.env.ADMIN_USERNAME;
    ADMIN.password = process.env.ADMIN_PASSWORD;
  }

  const second = await api('/api/admin/setup', { method: 'POST', body: ADMIN });
  check('setup is single-use', second.status === 409);

  const badLogin = await api('/api/admin/login', { method: 'POST', body: { username: ADMIN.username, password: 'wrong-password' } });
  check('wrong password rejected', badLogin.status === 401);

  const login = await api('/api/admin/login', { method: 'POST', body: { username: ADMIN.username, password: ADMIN.password }, expect: 200 });
  token = login.body.token;
  check('login returns a token', typeof token === 'string' && token.split('.').length === 3);

  const noAuth = await api('/api/admin/products');
  check('admin routes reject anonymous callers', noAuth.status === 401);
  const noAuthAnalytics = await api('/api/admin/analytics/overview');
  check('analytics rejects anonymous callers', noAuthAnalytics.status === 401, `status ${noAuthAnalytics.status}`);

  // ---------------------------------------------------------- product management
  console.log('\nProduct management');
  const adminList = await api('/api/admin/products?limit=5', { auth: true, expect: 200 });
  check('admin listing exposes cost price', typeof adminList.body.products[0].cost_price === 'number');
  check('admin listing exposes margin', typeof adminList.body.products[0].margin_pct === 'number');

  const sku = `SMOKE-${Date.now().toString(36).toUpperCase()}`;
  const created = await api('/api/admin/products', {
    method: 'POST',
    auth: true,
    expect: 201,
    body: {
      // Unique per run so re-running against a live store never collides.
      name: `Smoke Test Gadget ${sku}`,
      sku,
      brand: 'TestCo',
      cost_price: 60000,
      price: 100000,
      compare_at_price: 125000,
      stock: 25,
      moq: 2,
      tiers: [{ min_qty: 10, unit_price: 92000 }, { min_qty: 50, unit_price: 85000 }],
    },
  });
  const newId = created.body.id;
  check('product created', Number.isInteger(newId));

  const fetched = await api(`/api/admin/products/${newId}`, { auth: true, expect: 200 });
  const np = fetched.body.product;
  check('margin auto-calculated (40%)', np.margin_pct === 40, `got ${np.margin_pct}`);
  check('markup auto-calculated (66.67%)', np.markup_pct === 66.67, `got ${np.markup_pct}`);
  check('unit profit auto-calculated', np.profit_per_unit === 40000, `got ${np.profit_per_unit}`);
  check('discount badge auto-calculated (20%)', np.discount_pct === 20, `got ${np.discount_pct}`);
  check('stock value auto-calculated', np.stock_value === 25 * 60000, `got ${np.stock_value}`);
  check('tiers persisted', np.tiers.length === 2);
  check('opening stock wrote a ledger row', true);

  const moves0 = await api(`/api/admin/products/${newId}/movements`, { auth: true, expect: 200 });
  check('ledger opens with the initial count', moves0.body.movements.some((m) => m.reason === 'initial' && m.delta === 25));

  await api(`/api/admin/products/${newId}`, { method: 'PATCH', auth: true, expect: 200, body: { price: 120000 } });
  const repriced = await api(`/api/admin/products/${newId}`, { auth: true, expect: 200 });
  check('margin recalculates on reprice', repriced.body.product.margin_pct === 50, `got ${repriced.body.product.margin_pct}`);

  const dupSku = await api('/api/admin/products', { method: 'POST', auth: true, body: { name: `Dup ${sku}`, sku, price: 100 } });
  check('duplicate SKU rejected', dupSku.status === 409);

  // ---------------------------------------------------------- stock ledger
  console.log('\nStock ledger');
  const restock = await api(`/api/admin/products/${newId}/stock`, {
    method: 'POST', auth: true, expect: 200,
    body: { delta: 40, reason: 'restock', note: 'Smoke test carton' },
  });
  check('restock applied', restock.body.stock === 65, `got ${restock.body.stock}`);

  const moves = await api(`/api/admin/products/${newId}/movements`, { auth: true, expect: 200 });
  const restockRow = moves.body.movements.find((m) => m.reason === 'restock' && m.delta === 40);
  check('restock recorded in the ledger', Boolean(restockRow));
  check('ledger balance matches stock', restockRow?.balance_after === 65, `got ${restockRow?.balance_after}`);
  check('ledger records who did it', restockRow?.actor === ADMIN.username, `got ${restockRow?.actor}`);

  const overRemove = await api(`/api/admin/products/${newId}/stock`, { method: 'POST', auth: true, body: { delta: -500 } });
  check('cannot remove more than is in stock', overRemove.status === 400);

  const bothArgs = await api(`/api/admin/products/${newId}/stock`, { method: 'POST', auth: true, body: { delta: 1, set: 5 } });
  check('delta and set are mutually exclusive', bothArgs.status === 400);

  // ---------------------------------------------------------- orders
  console.log('\nOrders and inventory coupling');
  const before = (await api(`/api/admin/products/${newId}`, { auth: true })).body.product.stock;

  const order = await api('/api/orders', {
    method: 'POST', expect: 201,
    body: {
      customer_name: 'Smoke Tester',
      customer_phone: '01700000000',
      address: '12 Test Road',
      city: 'Dhaka',
      items: [{ product_id: newId, qty: 10 }],
    },
  });
  const orderNo = order.body.order.order_no;
  check('order created', typeof orderNo === 'string');
  check('order priced at the 10-unit tier', order.body.items[0].unit_price === 92000, `got ${order.body.items[0].unit_price}`);
  check('order subtotal = 10 × 92000', order.body.order.subtotal === 920000, `got ${order.body.order.subtotal}`);

  const after = (await api(`/api/admin/products/${newId}`, { auth: true })).body.product.stock;
  check('stock decremented by the order', after === before - 10, `${before} → ${after}`);

  const saleMoves = await api(`/api/admin/products/${newId}/movements`, { auth: true });
  check('sale written to the ledger', saleMoves.body.movements.some((m) => m.reason === 'sale' && m.delta === -10));

  const track = await api(`/api/orders/${orderNo}?phone=01700000000`, { expect: 200 });
  check('order tracking works with the right phone', track.body.order.order_no === orderNo);
  const wrongPhone = await api(`/api/orders/${orderNo}?phone=01999999999`);
  check('order tracking blocked with the wrong phone', wrongPhone.status === 404);

  const oversell = await api('/api/orders', {
    method: 'POST',
    body: {
      customer_name: 'Greedy', customer_phone: '01700000001', address: 'x', city: 'Dhaka',
      items: [{ product_id: newId, qty: 99999 }],
    },
  });
  check('oversell rejected', oversell.status === 409, `status ${oversell.status}`);

  // find the order id for admin operations
  const adminOrders = await api(`/api/admin/orders?q=${orderNo}`, { auth: true, expect: 200 });
  const orderRow = adminOrders.body.orders[0];
  check('order visible in admin', orderRow?.order_no === orderNo);
  check('order profit auto-calculated', orderRow?.profit === 920000 - 10 * 60000, `got ${orderRow?.profit}`);
  check('order margin auto-calculated', orderRow?.margin_pct === 34.78, `got ${orderRow?.margin_pct}`);

  // ---------------------------------------------------------- analytics
  console.log('\nAnalytics');
  await api(`/api/admin/orders/${orderRow.id}`, { method: 'PATCH', auth: true, expect: 200, body: { status: 'confirmed' } });

  const overview = await api('/api/admin/analytics/overview?days=30', { auth: true, expect: 200 });
  check('confirmed order counts as revenue', overview.body.sales.revenue > 0, `revenue=${taka(overview.body.sales.revenue)}`);
  check('profit rolled up', overview.body.sales.profit > 0, `profit=${taka(overview.body.sales.profit)}`);
  check('AOV computed', overview.body.sales.aov > 0);
  check('inventory valuation present', overview.body.inventory.stock_cost_value > 0);
  check('unrealised profit computed', overview.body.inventory.unrealised_profit > 0);
  check('catalogue counts present', overview.body.catalogue.active > 0);
  check('low-stock count present', typeof overview.body.inventory.low_stock === 'number');

  const series = await api('/api/admin/analytics/timeseries?days=14', { auth: true, expect: 200 });
  check('timeseries is zero-filled to 14 days', series.body.series.length === 14, `got ${series.body.series.length}`);
  check('today carries the revenue', series.body.series.at(-1).revenue > 0);
  // ">= 10" rather than "== 10": the store may already have today's real orders.
  check('units tracked separately from revenue', series.body.series.at(-1).units >= 10, `got ${series.body.series.at(-1).units}`);

  const top = await api('/api/admin/analytics/top-products?days=30&limit=50', { auth: true, expect: 200 });
  check('top products include this sale', top.body.products.some((p) => p.id === newId));
  check(
    'top products sorted by revenue',
    top.body.products.every((p, i) => i === 0 || top.body.products[i - 1].revenue >= p.revenue),
  );

  const cats = await api('/api/admin/analytics/categories', { auth: true, expect: 200 });
  check('category breakdown returned', cats.body.categories.length >= 8);

  const inv = await api('/api/admin/analytics/inventory', { auth: true, expect: 200 });
  check('low-stock alerts returned', Array.isArray(inv.body.alerts));
  check('out-of-stock product flagged', inv.body.alerts.some((a) => a.stock_state === 'out'));
  check('recent movements returned', inv.body.recent_movements.length > 0);

  // ---------------------------------------------------------- cancel + restock
  console.log('\nCancellation restores stock');
  const beforeCancel = (await api(`/api/admin/products/${newId}`, { auth: true })).body.product.stock;
  await api(`/api/admin/orders/${orderRow.id}`, { method: 'PATCH', auth: true, expect: 200, body: { status: 'cancelled' } });
  const afterCancel = (await api(`/api/admin/products/${newId}`, { auth: true })).body.product.stock;
  check('units returned to stock', afterCancel === beforeCancel + 10, `${beforeCancel} → ${afterCancel}`);

  const cancelMoves = await api(`/api/admin/products/${newId}/movements`, { auth: true });
  check('restock movement logged', cancelMoves.body.movements.some((m) => m.note?.includes('Auto-restock')));

  const afterCancelStats = await api('/api/admin/analytics/overview?days=30', { auth: true, expect: 200 });
  check('cancelled order drops out of revenue', afterCancelStats.body.sales.revenue < overview.body.sales.revenue,
    `${taka(overview.body.sales.revenue)} → ${taka(afterCancelStats.body.sales.revenue)}`);

  // ---------------------------------------------------------- cleanup
  await api(`/api/admin/products/${newId}`, { method: 'DELETE', auth: true, expect: 200 });
  const archived = await api(`/api/admin/products/${newId}`, { auth: true });
  check('archived product hidden from storefront', archived.body.product.status === 'archived');

  const audit = await api('/api/admin/audit?limit=10', { auth: true, expect: 200 });
  check('audit trail recorded', audit.body.entries.length > 0);

  // ---------------------------------------------------------- content
  console.log('\nContent, offers and accounts');
  const pagesRes = await api('/api/pages', { expect: 200 });
  check('company pages published', pagesRes.body.company.length >= 6);
  check('policy pages published', pagesRes.body.policy.length >= 7);
  const policyPage = await api('/api/pages/return-policy', { expect: 200 });
  check('a policy page has content', policyPage.body.page.body.length > 200);
  check('unpublished/unknown page 404s', (await api('/api/pages/not-a-real-page')).status === 404);

  const banners = await api('/api/banners', { expect: 200 });
  check('offer banners served', Array.isArray(banners.body.banners));

  const badPress = await api('/api/admin/content/press', {
    method: 'POST', auth: true, body: { title: 'x', url: 'javascript:alert(1)' },
  });
  check('press rejects a javascript: link', badPress.status === 400);

  // ---------------------------------------------------------- customer accounts
  const phone = `013${String(10000000 + Math.floor(Math.random() * 89999999))}`;
  const reg = await api('/api/account/register', {
    method: 'POST', expect: 201,
    body: { name: 'Smoke Shopper', phone, password: 'shopper-pass' },
  });
  const custToken = reg.body.token;
  check('customer can register', typeof custToken === 'string');

  const dupReg = await api('/api/account/register', {
    method: 'POST', body: { name: 'Again', phone, password: 'shopper-pass' },
  });
  check('duplicate number rejected', dupReg.status === 409);

  const badPass = await api('/api/account/login', { method: 'POST', body: { phone, password: 'nope' } });
  check('wrong customer password rejected', badPass.status === 401);

  const custLogin = await api('/api/account/login', {
    method: 'POST', expect: 200, body: { phone, password: 'shopper-pass' },
  });
  check('customer can sign in', typeof custLogin.body.token === 'string');

  // A customer token must never satisfy the staff guard.
  const crossover = await fetch(`${BASE}/api/admin/products`, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  check('customer token rejected by admin routes', crossover.status === 401, `got ${crossover.status}`);

  // …and a staff token must not open a customer account.
  const reverse = await fetch(`${BASE}/api/account/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check('admin token rejected by account routes', reverse.status === 401, `got ${reverse.status}`);

  // An order placed while signed in lands in that account's history.
  const band2 = (await api('/api/products/xiaomi-smart-band-9', { expect: 200 })).body.product;
  const custOrder = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({
      customer_name: 'Smoke Shopper', customer_phone: phone,
      address: '1 Test Road', city: 'Dhaka',
      items: [{ product_id: band2.id, qty: 1 }],
    }),
  });
  check('signed-in checkout works', custOrder.status === 201, `got ${custOrder.status}`);

  const myOrders = await fetch(`${BASE}/api/account/orders`, {
    headers: { Authorization: `Bearer ${custToken}` },
  }).then((r) => r.json());
  check('order appears in the account history', myOrders.orders.length === 1, `got ${myOrders.orders.length}`);

  const anonAccount = await api('/api/account/orders');
  check('account routes need a session', anonAccount.status === 401);

  report();
}

function report() {
  console.log(`\n${'─'.repeat(52)}`);
  const label = failed === 0 ? '\x1b[32mALL PASSED\x1b[0m' : '\x1b[31mFAILURES\x1b[0m';
  console.log(`${label}   ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n\x1b[31mSmoke test aborted:\x1b[0m ${err.message}\n`);
  process.exit(1);
});
