<div align="center">
  <img src="web/public/brand/logo.svg" alt="Arif Gadgets" width="330">
  <p><strong>Wholesale gadget marketplace — Cloudflare Workers + D1 API, GitHub Pages storefront.</strong></p>
</div>

---

## What this is

A complete storefront and back office for a gadget wholesaler:

- **Storefront** — Alibaba-style dense catalogue with volume price tiers, minimum order
  quantities, live stock, cart, checkout and order tracking.
- **Admin dashboard** — product management, stock ledger, order fulfilment and analytics.
- **Automated calculation** — margin, stock valuation, order totals, inventory movements
  and sales analytics all derive themselves. Nothing is typed in twice.

| | |
|---|---|
| **API** | Cloudflare Workers (Hono) + D1 + R2 + KV |
| **Storefront** | React + Vite, deployed to GitHub Pages |
| **Money** | Stored as integers in poisha (৳1 = 100) — no floating-point drift |
| **Auth** | PBKDF2-SHA256 passwords, HS256 JWT sessions |

---

## The automated calculation system

The point of the design is that **the database owns the arithmetic**, so the dashboard
can never disagree with the ledger.

### Derived on read — generated columns

Set a cost price and a selling price; everything else follows and can never go stale:

| Column | Derivation |
|---|---|
| `profit_per_unit` | `price − cost_price` |
| `margin_pct` | `(price − cost) / price` |
| `markup_pct` | `(price − cost) / cost` |
| `discount_pct` | from `compare_at_price` |
| `stock_value` / `retail_value` | `stock ×` cost / price |
| `stock_state` | `out` / `low` / `ok` against the product's threshold |
| `order.margin_pct` | profit over net sales |
| `order.counts_as_sale` | whether the status recognises revenue |

### Maintained on write — triggers

| Event | What happens automatically |
|---|---|
| Order line inserted | Stock decremented, `units_sold` bumped, ledger row written, order subtotal / cost / total / profit re-rolled |
| Discount, shipping or tax edited | Total and profit re-derived |
| Order cancelled or refunded | **Every unit returns to stock**, ledger records the reversal, the order drops out of revenue |
| Product created | Opening stock opens the ledger |
| Stock edited | Ledger row written with reason, note and actor |

A `CHECK (stock >= 0)` makes overselling impossible: a checkout that would drive stock
negative aborts its whole transaction rather than half-committing.

### Analytics

Every dashboard figure is a live aggregate over `orders`, `order_items` and
`stock_movements` — there is no rollup table to fall behind. Revenue, profit, margin,
AOV, units and customer counts each carry a period-over-period delta; the timeseries is
zero-filled so quiet days still appear; inventory reports valuation, the restock queue and
dead stock.

---

## First-time setup

### 1. Repository secrets

**Settings → Secrets and variables → Actions → Secrets**

| Secret | Required | What it is |
|---|---|---|
| `CLOUD_FLARE_API` | **yes** | Cloudflare API token with *Workers Scripts: Edit*, *D1: Edit*, *Workers R2 Storage: Edit*, *Workers KV Storage: Edit* |
| `CLOUD_FLARE_ACCOUNT_ID` | **yes** | Your Cloudflare account ID |
| `ADMIN_PASSWORD` | recommended | At least 10 characters |
| `ADMIN_EMAIL` | no | Contact address only — sign-in uses the username |
| `JWT_SECRET` | no | Generated automatically on first deploy if omitted |

No account identifier or token is committed to the repository — `wrangler.toml`
ships with an empty `account_id` that the deploy fills in from the secret.
The scripts also accept the standard `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` names if you prefer those.

**Variables** (same page, *Variables* tab)

| Variable | What it does |
|---|---|
| `API_DOMAIN` | Hostname for the API, e.g. `api.arifgadget.store`. Requires the domain to be a **zone in your Cloudflare account**; if it is not, the deploy says so and falls back to workers.dev. |
| `CUSTOM_DOMAIN` | e.g. `arifgadget.store` — serves Pages from the root and writes a `CNAME` |
| `WORKERS_SUBDOMAIN` | Alternative to `API_DOMAIN`: registers your account's one-time `*.workers.dev` name |
| `API_BASE_URL` | Alternative again: an API address you route yourself |
| `ADMIN_USERNAME` | Dashboard sign-in name, e.g. `arifgadget` |
| `ADMIN_NAME` | Display name for the owner account |

> Set `ADMIN_USERNAME` (variable) and `ADMIN_PASSWORD` (secret). Without them the
> dashboard falls back to first-run account creation, which is open to whoever
> reaches it first.
>
> **Keep the username a variable, not a secret.** Actions redacts a secret's value
> everywhere it appears in a run — if the username is a word that also occurs in
> your domain, the API URL gets redacted too and cannot be passed between jobs.

### 2. Enable GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

### 3. Deploy

Push to the deployment branch, or run the **Deploy** workflow manually. On the first run it:

1. Creates the D1 database, R2 bucket and KV namespace, then writes their IDs into `wrangler.toml`
2. Applies the migrations (schema, triggers, views and the seed catalogue)
3. Deploys the Worker and ensures `JWT_SECRET`
4. Creates the owner account
5. Health-checks the API, then builds and publishes the storefront

Re-runs reuse everything — the provisioning step is idempotent.

### Going live on arifgadget.store

The intended production layout, using the domain you already own:

| | Address | Served by |
|---|---|---|
| Storefront + dashboard | `arifgadget.store` | GitHub Pages |
| API | `api.arifgadget.store` | Cloudflare Worker |

Steps, once the domain's nameservers point at Cloudflare:

1. Add `arifgadget.store` as a zone in your Cloudflare account.
2. Set repository variables `CUSTOM_DOMAIN=arifgadget.store` and
   `API_DOMAIN=api.arifgadget.store`.
3. In **Settings → Pages**, set the custom domain to `arifgadget.store`.
   In Cloudflare DNS, the records pointing at GitHub Pages must be **DNS only**
   (grey cloud), not proxied — Pages terminates its own TLS.
4. Re-run **Deploy**. wrangler creates the `api.arifgadget.store` custom domain
   itself; nothing to click.

**Until the domain is ready**, give the API a temporary address instead: set
`WORKERS_SUBDOMAIN` to a name you like and the API lands on
`https://arif-gadgets-api.<name>.workers.dev`. That name is account-wide and
effectively permanent, so the deploy never invents one — it registers only what
you ask for.

The Worker deploys and the database migrates either way; the storefront build is
the only step that needs the API to have an address.

### A note on R2 (product image upload)

R2 needs a one-time opt-in in the Cloudflare dashboard before the API will
create buckets. **The deploy does not fail without it** — if R2 is off, the
bootstrap skips the bucket, drops the binding and prints a notice. The
storefront, dashboard, orders and analytics all work; only image upload is
disabled, and products fall back to generated category artwork.

To turn uploads on: Cloudflare dashboard → **R2** → enable (it asks for a
payment method; the free tier covers a shop this size), then re-run the
**Deploy** workflow. Nothing in the code changes.

---

## Local development

```bash
npm install

# API on http://127.0.0.1:8787
echo "JWT_SECRET=local-dev-secret" > worker/.dev.vars
npm run migrate:local --workspace worker
npm run dev:api

# Storefront on http://127.0.0.1:5173 (separate terminal)
npm run dev:web
```

Then open the storefront, go to **Admin**, and use *First time? Create the owner account*.
Staff sign in with a **username**, not an email address.

```bash
npm run typecheck                 # worker + web
node scripts/smoke-test.mjs       # 79 assertions against a running API
node scripts/demo-orders.mjs http://127.0.0.1:8787 arifgadget yourpassword 14
```

`smoke-test.mjs` covers tier pricing, MOQ enforcement, the stock ledger, oversell
protection, the cancel-restock trigger and every analytics endpoint. CI runs it against a
local Miniflare instance on every pull request.

---

## API

Public:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/storefront` | Home payload in one round trip |
| `GET` | `/api/products` | `?category= &q= &brand= &sort= &in_stock= &page=` |
| `GET` | `/api/products/:slug` | Detail with tiers and related items |
| `GET` | `/api/categories`, `/api/settings` | Navigation and store config |
| `POST` | `/api/quote` | Re-prices a cart through the tier engine |
| `POST` | `/api/orders` | Checkout |
| `GET` | `/api/orders/:orderNo?phone=` | Order tracking |

Admin — all require `Authorization: Bearer <token>`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/setup` | First-run owner creation; 409s forever after |
| `POST` | `/api/admin/login` | `{username, password}` → a 12-hour JWT |
| `GET POST PATCH DELETE` | `/api/admin/products[/:id]` | Catalogue CRUD (delete archives) |
| `POST` | `/api/admin/products/:id/stock` | `{delta}` or `{set}` + reason — writes the ledger |
| `GET` | `/api/admin/products/:id/movements` | Ledger history |
| `GET PATCH` | `/api/admin/orders[/:id]` | Fulfilment; status drives the restock trigger |
| `POST` | `/api/admin/uploads` | Product image → R2, served from `/files/:key` |
| `GET PATCH` | `/api/admin/settings` | Shipping, tax, contact details |
| `GET` | `/api/admin/analytics/{overview,timeseries,top-products,categories,inventory}` | Dashboard data |

Cost price, profit and margin are **never** included in public responses.

---

## Notes for the operator

- **Stock is never edited as a plain field.** The dashboard routes every change through a
  dialog that captures a reason and a note, so the ledger explains itself months later.
- **Archive, don't delete.** Archiving hides a product from the storefront while past
  orders keep pointing at a real row.
- **Cancelling an order restocks it.** That is a trigger, not a UI convenience — it holds
  even if the status is changed through the API.
- **Revenue recognition** starts at `confirmed`. Pending orders hold stock but are not
  counted as sales; cancelled and refunded orders drop out and return their units.
- **Currency** is set in Settings. Prices are entered in taka and stored in poisha.
- **Payments accepted** at checkout: cash on delivery, bKash, Nagad, Rocket and bank
  transfer. The footer badges in `web/src/components/PaymentBadges.tsx` are plain
  wordmarks drawn inline — swap in each provider's official artwork once the
  merchant accounts are live.

**A full, non-technical walkthrough of the dashboard is in
[ADMIN_GUIDE.md](ADMIN_GUIDE.md)** — adding products, volume tiers, photos, stock,
order fulfilment, restocking and the recommended daily routine.

### Security

- `ALLOWED_ORIGINS` in `worker/wrangler.toml` is empty, which lets any origin call the API.
  That is deliberate — sessions are Bearer tokens rather than cookies, so CORS is not what
  protects the admin routes, and a stale list silently breaks checkout after a domain move.
  Fill it in if you want to stop other sites embedding the catalogue.
- Order tracking requires the order number **and** the phone number on the order.
- Every admin write lands in `audit_log`, surfaced under Settings → Activity log.

> **Rotate the shared credentials.** The Cloudflare API token and the dashboard password
> were both sent in chat messages while this was being built, so treat them as exposed.
> Issue a fresh Cloudflare token, update the `CLOUD_FLARE_API` secret, revoke the old
> token, then change `ADMIN_PASSWORD` and re-run the Deploy workflow.

---

## Layout

```
worker/
  migrations/        schema + triggers + views, then the seed catalogue
  src/lib/           auth (PBKDF2/JWT), pricing (tiers, cart), catalog, http helpers
  src/routes/        catalog · orders · admin · analytics
web/
  public/brand/      logo, monogram mark, hero banner (SVG)
  src/components/    layout, product card, generated thumbnails, SVG charts
  src/pages/         storefront + admin/
scripts/
  bootstrap-cf.mjs   idempotent D1/R2/KV provisioning
  create-admin.mjs   owner account, PBKDF2 matched to the Worker
  smoke-test.mjs     end-to-end API assertions
  demo-orders.mjs    realistic orders for a fresh install
```

Chart colours live in `web/src/styles.css` as `--series-1..3` and are validated for
contrast and colour-vision separation against both the light and dark surfaces.
