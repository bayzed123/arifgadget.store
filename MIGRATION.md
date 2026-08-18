# Cloudflare account migration

The shop is moving to a new Cloudflare account. The client asked for a clean
setup rather than a copy of the old data, so this is now a **fresh build**:
the migrations create the schema, seed the catalogue and settings, and the
deploy provisions the Worker, its secrets and the dashboard owner.

**The live shop is not affected while this is in progress.** The failed deploys
stopped inside the Worker job, so GitHub Pages was never republished and the
old account's Worker keeps serving arifgadget.store. Nothing goes dark until
the new deploy finishes green. Do not delete the old Cloudflare account until
then.

## State of the new account

| Resource | Name | Status |
|---|---|---|
| D1 database | `arif-gadgets` | `3c619937-10e9-43ec-9e9f-c0fd0c1da71c` — created, empty, ready for migrations |
| KV namespace | `arif-gadgets-cache` | `a7c032dadfd54f89afd5b01134ec8973` — created |
| R2 bucket | `arif-gadgets-media` | not created — R2 is not switched on for this account |
| Worker | `arif-gadgets-api` | not deployed yet |
| workers.dev subdomain | — | **not registered** |

The deploy finds the database and namespace by name and fills `wrangler.toml`
in automatically; nothing in that table needs copying by hand.

**R2** stays optional. Without it, image *upload* in the dashboard returns a
clear "storage is not enabled" message and pasting an image URL works as
normal — the same behaviour as the previous account. Enabling R2 in the
Cloudflare dashboard turns upload on at the next deploy, with no code change.

## Two things block the deploy

Run the **Cloudflare doctor** workflow at any time to re-check both. It probes
every capability the deploy needs and prints the exact fix for each failure,
without ever printing the token.

### 1. The API token cannot write to D1

`wrangler d1 migrations apply` runs every statement through the D1 `query`
endpoint, which Cloudflare classes as a write. The current token is refused
there:

```
A request to the Cloudflare API (/accounts/…/d1/database/3c619937-…/query) failed.
You do not have permission to perform this operation. [code: 7500]
```

The token authenticates into the right account and can *list* D1 databases, so
the account ID is correct — it is the permission that is short.

**Fix:** *My Profile → API Tokens*, and either edit the token to add
**Account → D1 → Edit**, or create a new one from the **"Edit Cloudflare
Workers"** template, which grants Workers Scripts, Workers KV, D1 and R2 in one
click. Put the value in the `CLOUD_FLARE_API` repository secret.

### 2. The account has no workers.dev subdomain

Until one exists the Worker has no public address, so the storefront build has
no API to point at and stops.

**Fix:** set the `WORKERS_SUBDOMAIN` repository variable (*Settings → Secrets
and variables → Actions → Variables*) to the name you want — the next deploy
registers it and the API becomes
`https://arif-gadgets-api.<name>.workers.dev`. Or register it by hand under
*Workers & Pages*. The name is account-wide and permanent, and the old
account's name cannot be reused while that account still holds it.

## Order of operations

1. Fix the token permissions and set `WORKERS_SUBDOMAIN` (above).
2. Confirm `CLOUD_FLARE_ACCOUNT_ID` and `CLOUD_FLARE_API` hold the **new**
   account's values.
3. Run **Cloudflare doctor**. Every line should be green.
4. Run **Deploy**. It applies all eleven migrations to the empty database,
   deploys the Worker, generates `JWT_SECRET`, creates the dashboard owner from
   `ADMIN_USERNAME` / `ADMIN_PASSWORD`, then rebuilds the storefront against the
   new API address.
5. Check the shop: place a test order, track it by phone number, open the
   invoice, sign in to the dashboard.

## What the fresh database contains

The migrations rebuild a complete, working shop — 8 categories, 27 catalogue
products with stock, cost and retail prices, wholesale price tiers, all store
settings (delivery ৳90 inside Dhaka / ৳130 outside, payment numbers, contact
details, the fixed footer credits) and the published content pages.

What it does **not** contain is the old account's live trading data: the six
products the client added by hand, sixteen orders, two customer accounts and
their stock history. That is not lost — it is in the **Backup database**
artifact `d1-backup-20260818-120910` from run `32135307690`, kept for the
artifact retention period. If the client later wants any of it, restore from
there rather than re-entering it.

## Rollback

Put the old `CLOUD_FLARE_API` and `CLOUD_FLARE_ACCOUNT_ID` back and re-run
Deploy. Keep the old account alive for at least a week after the new one is
green.

## Note on the restore workflow

**Restore database to a new Cloudflare account** is still in the repository and
still guarded against pointing at the wrong account, but it needs a token that
can use D1's bulk-import endpoint — the current one is refused there with
`Authentication error [code: 10000]`. A token from the "Edit Cloudflare
Workers" template clears that too.
