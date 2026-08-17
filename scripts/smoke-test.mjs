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
  check('a single piece can be quoted', single.body.lines[0].qty === 1, `got ${single.body.lines[0].qty}`);
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
  const cheap = await api('/api/quote', {
    method: 'POST', expect: 200,
    body: { items: [{ product_id: band.id, qty: 1 }], delivery_zone: 'outside' },
  });
  check('outside-Dhaka delivery is ৳130', cheap.body.shipping === 13000, `got ${cheap.body.shipping}`);
  check('free-shipping gap reported', cheap.body.free_shipping_gap === 500000 - 425000, `got ${cheap.body.free_shipping_gap}`);

  const inDhaka = await api('/api/quote', {
    method: 'POST', expect: 200,
    body: { items: [{ product_id: band.id, qty: 1 }], delivery_zone: 'dhaka' },
  });
  check('inside-Dhaka delivery is ৳90', inDhaka.body.shipping === 9000, `got ${inDhaka.body.shipping}`);
  check('the zone comes back on the quote', inDhaka.body.delivery_zone === 'dhaka');
  check('picking a zone changes the total', inDhaka.body.total === cheap.body.total - 4000,
    `${taka(cheap.body.total)} → ${taka(inDhaka.body.total)}`);

  const noZone = await api('/api/quote', { method: 'POST', expect: 200, body: { items: [{ product_id: band.id, qty: 1 }] } });
  check('an unspecified zone falls back to the higher rate', noZone.body.shipping === 13000);
  const junkZone = await api('/api/quote', {
    method: 'POST', expect: 200,
    body: { items: [{ product_id: band.id, qty: 1 }], delivery_zone: 'narnia' },
  });
  check('a nonsense zone falls back safely', junkZone.body.shipping === 13000);

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

  console.log('\nFree-delivery threshold');
  // A threshold of 0 must mean "always charge", not "everything is free".
  const priorThreshold = (await api('/api/settings', { expect: 200 })).body.free_shipping_over;
  await api('/api/admin/settings', { method: 'PATCH', auth: true, body: { free_shipping_over: 0 } });
  try {
    const zeroSmall = await api('/api/quote', {
      method: 'POST', expect: 200,
      body: { items: [{ product_id: band.id, qty: 1 }], delivery_zone: 'dhaka' },
    });
    check('threshold 0 still charges a small order', zeroSmall.body.shipping === 9000, `got ${zeroSmall.body.shipping}`);
    check('threshold 0 never says free', zeroSmall.body.free_shipping_applied === false);
    check('threshold 0 shows no "spend more" gap', zeroSmall.body.free_shipping_gap === 0);

    const zeroBig = await api('/api/quote', {
      method: 'POST', expect: 200,
      body: { items: [{ product_id: band.id, qty: 40 }], delivery_zone: 'outside' },
    });
    check('threshold 0 charges a big order too', zeroBig.body.shipping === 13000, `got ${zeroBig.body.shipping}`);
  } finally {
    await api('/api/admin/settings', { method: 'PATCH', auth: true, body: { free_shipping_over: priorThreshold } });
  }

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

  // Empty the test product so the alert being asserted is one this run created,
  // rather than depending on whatever the shop happens to be short of today.
  await api(`/api/admin/products/${newId}/stock`, {
    method: 'POST', auth: true, expect: 200,
    body: { set: 0, reason: 'adjustment', note: 'Smoke test: force an out-of-stock alert' },
  });

  const inv = await api('/api/admin/analytics/inventory', { auth: true, expect: 200 });
  check('low-stock alerts returned', Array.isArray(inv.body.alerts));
  check('out-of-stock product flagged', inv.body.alerts.some((a) => a.id === newId && a.stock_state === 'out'));
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

  // -------------------------------------- order one piece, or the whole shelf
  console.log('\nOrder from 1 piece up to stock');
  const anyProducts = (await api('/api/products?limit=50', { expect: 200 })).body.products;
  check('every product can be ordered singly', anyProducts.every((p) => p.moq === 1),
    anyProducts.filter((p) => p.moq !== 1).map((p) => `${p.name}=${p.moq}`).join(', ') || 'all moq 1');

  // A throwaway product with a small shelf, so repeated runs never depend on —
  // or strand — whatever the real shop has in stock.
  const shelfSku = `SHELF-${Date.now().toString(36).toUpperCase()}`;
  const shelf = await api('/api/admin/products', {
    method: 'POST', auth: true, expect: 201,
    body: {
      name: `Shelf Test Gadget ${shelfSku}`, sku: shelfSku, brand: 'TestCo',
      cost_price: 50000, price: 80000, stock: 8, moq: 1, status: 'active',
    },
  });
  const shelfProduct = { id: shelf.body.id ?? shelf.body.product?.id };

  const onePiece = await api('/api/orders', {
    method: 'POST', expect: 201,
    body: {
      customer_name: 'Single Piece', customer_phone: '01555222333',
      address: '1 Retail Lane', city: 'Dhaka', delivery_zone: 'dhaka',
      items: [{ product_id: shelfProduct.id, qty: 1 }],
    },
  });
  check('a one-piece order goes through', onePiece.body.order.order_no.startsWith('AG'));
  const wholeShelf = await api('/api/orders', {
    method: 'POST', expect: 201,
    body: {
      customer_name: 'Whole Shelf', customer_phone: '01555222444',
      address: '2 Retail Lane', city: 'Dhaka',
      items: [{ product_id: shelfProduct.id, qty: 7 }],
    },
  });
  check('the entire shelf can be bought in one order', wholeShelf.body.order.order_no.startsWith('AG'));
  const emptied = (await api(`/api/admin/products/${shelfProduct.id}`, { auth: true })).body.product;
  check('that leaves the shelf empty, not negative', emptied.stock === 0, `stock ${emptied.stock}`);
  check('one more unit is refused', (await api('/api/orders', {
    method: 'POST',
    body: {
      customer_name: 'One Too Many', customer_phone: '01555222555',
      address: '3 Retail Lane', city: 'Dhaka',
      items: [{ product_id: shelfProduct.id, qty: 1 }],
    },
  })).status === 409);

  await api(`/api/admin/products/${shelfProduct.id}`, { method: 'DELETE', auth: true, expect: 200 });

  // ---------------------------------------- payment details and the invoice
  console.log('\nPayment details and invoice');
  const payCfg = await api('/api/settings', { expect: 200 });
  check('the shop publishes its bKash number', Boolean(payCfg.body.bkash_number), payCfg.body.bkash_number);
  check('the shop publishes its Nagad number', Boolean(payCfg.body.nagad_number));
  check('the shop publishes its Rocket number', Boolean(payCfg.body.rocket_number));
  check('an order WhatsApp number is configured', Boolean(payCfg.body.order_whatsapp), payCfg.body.order_whatsapp);

  const trx = `TRX${Date.now().toString(36).toUpperCase()}`;
  const paid = await api('/api/orders', {
    method: 'POST', expect: 201,
    body: {
      customer_name: 'Invoice Test', customer_phone: '01555333444',
      address: '5 Invoice Road', city: 'Dhaka', delivery_zone: 'dhaka',
      payment_method: 'bkash', payment_reference: trx, note: 'Please call before delivery',
      // One band stays under the free-delivery threshold, so the zone rate is
      // the thing actually being asserted below.
      items: [{ product_id: band.id, qty: 1 }],
    },
  });
  const invNo = paid.body.order.order_no;

  const invoice = await api(`/api/orders/${invNo}?phone=01555333444`, { expect: 200 });
  check('the invoice carries the TrxID', invoice.body.order.payment_reference === trx, invoice.body.order.payment_reference);
  check('the invoice carries the payment method', invoice.body.order.payment_method === 'bkash');
  check('the invoice carries the delivery zone', invoice.body.order.delivery_zone === 'dhaka');
  check('the invoice charges the Dhaka rate', invoice.body.order.shipping === 9000, `got ${invoice.body.order.shipping}`);
  check('the invoice carries the address', invoice.body.order.address === '5 Invoice Road');
  check('the invoice carries the note', invoice.body.order.note === 'Please call before delivery');
  check('the invoice lists its items', invoice.body.items.length === 1 && invoice.body.items[0].qty === 1);
  check('the invoice total adds up',
    invoice.body.order.total === invoice.body.order.subtotal - invoice.body.order.discount +
      invoice.body.order.shipping + invoice.body.order.tax,
    `${taka(invoice.body.order.total)}`);

  const adminView = (await api(`/api/admin/orders?q=${invNo}`, { auth: true, expect: 200 })).body.orders[0];
  check('the dashboard shows the TrxID', adminView.payment_reference === trx);

  // ------------------------------------------- delivery checkpoint pipeline
  // pending → confirmed → shipped ("On the way") → delivered, with returned
  // and cancelled as the two exits that put stock back.
  console.log('\nDelivery checkpoints');
  const cpProduct = (await api('/api/products/xiaomi-smart-band-9', { expect: 200 })).body.product;
  const cpStockBefore = (await api(`/api/admin/products/${cpProduct.id}`, { auth: true })).body.product.stock;

  const cpOrder = await api('/api/orders', {
    method: 'POST', expect: 201,
    body: {
      customer_name: 'Checkpoint Test', customer_phone: '01555000111',
      address: '9 Courier Road', city: 'Dhaka',
      items: [{ product_id: cpProduct.id, qty: 4 }],
    },
  });
  const cpAdmin = (await api(`/api/admin/orders?q=${cpOrder.body.order.order_no}`, { auth: true })).body.orders[0];
  const move = (status) =>
    api(`/api/admin/orders/${cpAdmin.id}`, { method: 'PATCH', auth: true, body: { status } });

  const cpStockAfterOrder = (await api(`/api/admin/products/${cpProduct.id}`, { auth: true })).body.product.stock;
  check('ordering takes the units off the shelf', cpStockAfterOrder === cpStockBefore - 4,
    `${cpStockBefore} → ${cpStockAfterOrder}`);
  check('a new order starts at pending', cpAdmin.status === 'pending', cpAdmin.status);

  check('cannot skip straight to delivered', (await move('delivered')).status === 400);
  check('cannot skip straight to on the way', (await move('shipped')).status === 400);
  check('retired "packed" is refused', (await move('packed')).status === 400);

  check('pending → confirmed', (await move('confirmed')).status === 200);
  const cpConfirmed = await api('/api/admin/analytics/overview?days=30', { auth: true, expect: 200 });
  check('confirming books the revenue', cpConfirmed.body.sales.revenue > 0);

  check('confirmed → on the way', (await move('shipped')).status === 200);
  check('on the way → delivered', (await move('delivered')).status === 200);
  check('a delivered order cannot be cancelled', (await move('cancelled')).status === 400);

  const cpStockDelivered = (await api(`/api/admin/products/${cpProduct.id}`, { auth: true })).body.product.stock;
  check('stock stays off the shelf through delivery', cpStockDelivered === cpStockBefore - 4,
    `${cpStockDelivered}`);

  const revenueBeforeReturn = (await api('/api/admin/analytics/overview?days=30', { auth: true })).body.sales.revenue;
  // The API accepts the friendly word and stores the value the CHECK allows.
  check('delivered → returned', (await move('returned')).status === 200);

  const cpStockReturned = (await api(`/api/admin/products/${cpProduct.id}`, { auth: true })).body.product.stock;
  check('a return puts every unit back', cpStockReturned === cpStockBefore, `${cpStockDelivered} → ${cpStockReturned}`);

  const cpMoves = await api(`/api/admin/products/${cpProduct.id}/movements`, { auth: true });
  check('the return is written to the stock ledger',
    cpMoves.body.movements.some((m) => m.reason === 'return' && m.note?.includes(cpOrder.body.order.order_no)));

  const revenueAfterReturn = (await api('/api/admin/analytics/overview?days=30', { auth: true })).body.sales.revenue;
  check('a return removes the money from revenue', revenueAfterReturn < revenueBeforeReturn,
    `${taka(revenueBeforeReturn)} → ${taka(revenueAfterReturn)}`);

  check('returned is final — cannot go back to delivered', (await move('delivered')).status === 400);
  check('returned is final — cannot reopen as pending', (await move('pending')).status === 400);

  const cpTracked = await api(`/api/orders/${cpOrder.body.order.order_no}?phone=01555000111`, { expect: 200 });
  check('the customer sees the returned checkpoint', cpTracked.body.order.status === 'refunded',
    cpTracked.body.order.status);

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

  // ------------------------------------------------- tracking tolerates formats
  // Real orders were stored as +8801400290812 while the shopper types
  // 01400290812, so an exact string match found nothing.
  console.log('\nOrder tracking accepts any phone format');
  const trackBand = (await api('/api/products/xiaomi-smart-band-9', { expect: 200 })).body.product;
  const intlOrder = await api('/api/orders', {
    method: 'POST', expect: 201,
    body: {
      customer_name: 'Format Test', customer_phone: '+8801400290828',
      address: '1 Test Road', city: 'Dhaka',
      items: [{ product_id: trackBand.id, qty: 1 }],
    },
  });
  const intlNo = intlOrder.body.order.order_no;

  check(
    'a +880 number is stored canonically',
    (await api(`/api/admin/orders?q=${intlNo}`, { auth: true, expect: 200 })).body.orders[0].customer_phone
      === '01400290828',
  );

  for (const typed of ['01400290828', '+8801400290828', '8801400290828', '01400-290828', '01400 290828']) {
    const res = await api(`/api/orders/${intlNo}?phone=${encodeURIComponent(typed)}`);
    check(`tracking works when the shopper types ${typed}`, res.status === 200, `got ${res.status}`);
  }

  check(
    'a lowercase order number still resolves',
    (await api(`/api/orders/${intlNo.toLowerCase()}?phone=01400290828`)).status === 200,
  );
  check(
    'a different number is still refused',
    (await api(`/api/orders/${intlNo}?phone=01400290812`)).status === 404,
  );

  // Registering with a number used for guest orders must adopt them, whatever
  // format those older orders were saved in.
  const adoptPhone = `014${String(10000000 + Math.floor(Math.random() * 89999999))}`;
  await api('/api/orders', {
    method: 'POST', expect: 201,
    body: {
      customer_name: 'Adopt Me', customer_phone: `+88${adoptPhone}`,
      address: '2 Test Road', city: 'Dhaka',
      items: [{ product_id: trackBand.id, qty: 1 }],
    },
  });
  const adopted = await api('/api/account/register', {
    method: 'POST', expect: 201,
    body: { name: 'Adopt Me', phone: adoptPhone, password: 'adopt-pass-1' },
  });
  const adoptedOrders = await fetch(`${BASE}/api/account/orders`, {
    headers: { Authorization: `Bearer ${adopted.body.token}` },
  }).then((r) => r.json());
  check('guest orders are adopted on registration', adoptedOrders.orders.length === 1, `got ${adoptedOrders.orders.length}`);

  // ------------------------------------------------- customers in the dashboard
  console.log('\nCustomers in the dashboard');
  const custList = await api(`/api/admin/customers?q=${phone}`, { auth: true, expect: 200 });
  const listed = custList.body.customers[0];
  check('registered shopper appears in the dashboard', Boolean(listed), `${custList.body.total} matched`);
  check('dashboard shows the name and number', listed?.name === 'Smoke Shopper' && listed?.phone === phone);
  check('dashboard rolls up their order count', listed?.orders === 1, `orders ${listed?.orders}`);
  check('password material is never returned', !('password_hash' in (listed ?? {})) && !('salt' in (listed ?? {})));

  const custDetail = await api(`/api/admin/customers/${listed.id}`, { auth: true, expect: 200 });
  check('customer detail lists their orders', custDetail.body.orders.length === 1);
  check('customer list needs a staff session', (await api('/api/admin/customers')).status === 401);

  // ------------------------------------------------- footer credits are fixed
  console.log('\nLocked settings');
  const lockedTry = await api('/api/admin/settings', {
    method: 'PATCH', auth: true, body: { credit_dev_name: 'someone else' },
  });
  check('footer credit cannot be changed', lockedTry.status === 400, `got ${lockedTry.status}`);

  const mixedTry = await api('/api/admin/settings', {
    method: 'PATCH', auth: true, body: { store_tagline: 'Wholesale gadgets', credit_author_url: 'https://evil.test' },
  });
  check('a locked key poisons the whole save', mixedTry.status === 400, `got ${mixedTry.status}`);

  const stillThere = await api('/api/admin/settings', { auth: true, expect: 200 });
  const credit = stillThere.body.settings.find((s) => s.key === 'credit_dev_name');
  check('the credit survived the attempt', credit?.value === 'SmartGen', `value ${credit?.value}`);

  const allowed = await api('/api/admin/settings', {
    method: 'PATCH', auth: true, body: { store_tagline: 'Wholesale gadgets, priced by the carton' },
  });
  check('ordinary settings still save', allowed.status === 200, `got ${allowed.status}`);

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
