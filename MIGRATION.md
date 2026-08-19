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
| D1 database | `arif-gadgets` | `3c619937-10e9-43ec-9e9f-c0fd0c1da71c` — **built: all 13 migrations applied and verified** |
| KV namespace | `arif-gadgets-cache` | `a7c032dadfd54f89afd5b01134ec8973` — created |
| R2 bucket | `arif-gadgets-media` | created — R2 is enabled, so dashboard image upload works |
| Worker | `arif-gadgets-api` | not deployed yet |
| workers.dev subdomain | — | **not registered** |

The deploy finds the database and namespace by name and fills `wrangler.toml`
in automatically; nothing in that table needs copying by hand.

### What the database holds

Built statement by statement and checked afterwards:

| | |
|---|---|
| Tables / triggers / views / indexes | 17 / 8 / 2 / 29 |
| Categories | 8 |
| Products | 31, every one at MOQ 1 |
| Volume price tiers | 27 |
| Content pages | 13 (company + policy) |
| Offer banners | 1 starter banner |
| Settings | 25 |
| Opening stock ledger rows | 30 |
| Orders / customers / admins | 0 — nothing but a clean shop |

Delivery is ৳90 inside Dhaka and ৳130 elsewhere, free-delivery threshold ৳5000,
the payment numbers and WhatsApp order line are in place, and the footer
credits read SmartGen / Sayad Bayezid.

`d1_migrations` already records all twelve files, so `wrangler d1 migrations
apply` will report nothing to do rather than trying to build it a second time.

### The automated calculation was tested on this database

A throwaway order was pushed through the full checkpoint chain and then
removed, leaving the counts above unchanged:

- 3 × ৳1150 → subtotal ৳3450, cost ৳2550, delivery ৳90 (Dhaka), total ৳3540,
  profit ৳900, margin 26.09%
- stock 150 → 147 and `units_sold` 0 → 3 on the sale
- `pending → confirmed → shipped → delivered` flipped `counts_as_sale` and the
  daily sales view picked up the revenue, cost and profit
- `refunded` ("Returned") put all three units back, reversed `units_sold`, and
  removed the revenue from the daily view again
- the ledger recorded exactly one `sale` and one `return`

**R2** is now switched on and the bucket exists, so uploading a product photo
in the dashboard works from the first deploy. (The code still degrades
gracefully if R2 is ever turned off: upload reports "storage is not enabled"
and pasting an image URL keeps working.)

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
4. Run **Deploy**. The database is already built, so migrations report nothing
   to do; the deploy then puts the Worker on the new account, generates
   `JWT_SECRET`, creates the dashboard owner from `ADMIN_USERNAME` /
   `ADMIN_PASSWORD`, and rebuilds the storefront against the new API address.
5. Check the shop: place a test order, track it by phone number, open the
   invoice, sign in to the dashboard.

## Steadfast courier

Two repository secrets connect the shop to the courier:

| Secret | |
|---|---|
| `STEADFAST_API_KEY` | Api-Key from the Steadfast portal |
| `STEADFAST_SECRET_KEY` | Secret-Key from the same page |
| `STEADFAST_WEBHOOK_TOKEN` | Optional. A long random string you invent — see below |

The deploy writes both onto the Worker. Leaving them unset is a supported
state: the dashboard shows "Steadfast not connected", the send-to-courier
buttons stay hidden, and every other part of the shop is unaffected. They are
never written as empty strings, because a Worker that believes it is configured
fails every courier call instead of saying it is not connected.

Both keys authorise real bookings and control COD collection, so treat them
like a bank credential: rotate them in the Steadfast portal if they are ever
pasted into a chat, an email or a ticket, and put the replacement straight into
the GitHub secret.

### How shoppers see courier updates

The tracking page shows the courier's own status next to the shop's
checkpoints, and refreshes it from Steadfast when the stored copy is more than
five minutes old — rate-limited through KV, so a shopper reloading the page
cannot turn into a burst of calls on the courier's API. Settled orders are
never refreshed; a delivered parcel has nothing left to report.

That means **the webhook is optional**. Without it everything works, updates
just arrive when someone looks rather than the instant they happen.

To turn it on: invent a long random string, set it as `STEADFAST_WEBHOOK_TOKEN`,
deploy, then give Steadfast this URL:

```
https://<your-api-host>/api/courier/steadfast/<the-token>
```

The token *is* the authentication — the route 404s on a wrong or missing one,
so a scanner cannot even tell the endpoint exists. Treat that URL as a password
and do not paste it anywhere public. The endpoint answers 200 even for payloads
it cannot use, because a webhook that returns errors gets switched off at the
sender's end.

## The dashboard owner

There is deliberately no admin account in the database yet. The password
belongs in the `ADMIN_PASSWORD` repository secret and nowhere else — not in a
migration, not in this file, not in a chat message — and `create-admin.mjs`
provisions the owner from that secret on the first successful deploy. Until
then the Worker does not exist, so there is nothing to sign in to.

The same script re-runs on every deploy and resets the owner's password to
whatever the secret currently holds, which is also how the password gets
rotated: change the secret, run Deploy.

## What the fresh database does not contain

The old account's live trading data: the two products the client added by hand,
sixteen orders, two customer accounts and their stock history. That is not
lost — it is in the **Backup database** artifact `d1-backup-20260818-120910`
from run `32135307690`, kept for the artifact retention period. If the client
later wants any of it, restore from there rather than re-entering it.

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
