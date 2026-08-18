# Cloudflare account migration

The shop is moving to a new Cloudflare account. Everything except the data
rebuilds itself, so this is short — but the order matters.

## Resources created on the new account

Created ahead of the first deploy, so the restored data lands in a clean
database instead of colliding with the seed data a fresh migration would write.

| Resource | Name | ID |
|---|---|---|
| D1 database | `arif-gadgets` | `3c619937-10e9-43ec-9e9f-c0fd0c1da71c` |
| KV namespace | `arif-gadgets-cache` | `a7c032dadfd54f89afd5b01134ec8973` |
| R2 bucket | `arif-gadgets-media` | not created — R2 is not enabled on the account |

The deploy finds both by name and fills `wrangler.toml` in automatically;
nothing here needs to be copied by hand.

**R2** stays optional. Without it, image *upload* in the dashboard returns a
clear "storage is not enabled" message and pasting an image URL works as
normal — the same behaviour as the previous account. Enabling R2 in the
Cloudflare dashboard turns upload on at the next deploy, with no code change.

## Order of operations

1. **Back up the old account.** Run **Backup database**. It uses the existing
   credentials and uploads a full SQL dump as a workflow artifact. Note the run
   ID and download a copy locally.
2. **Add the destination credentials** as repository secrets:
   `CLOUD_FLARE_API_NEW`, `CLOUD_FLARE_ACCOUNT_ID_NEW`. Keeping these separate
   from the live pair means the old account stays reachable for rollback.
3. **Restore.** Run **Restore database to a new Cloudflare account** with the
   backup run ID and the destination database ID from the table above. It
   refuses to run unless that account really holds that database, so a stale
   secret cannot empty the live shop.
4. **Compare the row counts** it prints against the backup run's summary.
5. **Register the workers.dev subdomain** on the new account
   (*Workers & Pages → Overview*). The name is permanent. Set it as the
   repository variable `WORKERS_SUBDOMAIN`.
6. **Switch the live secrets:** replace `CLOUD_FLARE_API` and
   `CLOUD_FLARE_ACCOUNT_ID` with the new account's values.
7. **Run Deploy.** The Worker deploys to the new account, migrations apply
   nothing because the restored dump already records them as run, and the
   storefront rebuilds pointing at the new API address.
8. **Check the shop:** place a test order, track it, open the invoice, sign in
   to the dashboard.

## What changes for people

- **Everyone is signed out once.** `JWT_SECRET` is regenerated on the new
  account, which invalidates existing sessions. Passwords are unaffected —
  they are hashed in the database, which is cloned.
- **The API address changes** to the new account's `*.workers.dev` subdomain.
  The storefront picks this up at build time, so it updates itself on deploy.
- Nothing else moves: the domain, GitHub Pages and Google Analytics are all
  outside Cloudflare.

## Rollback

Put the old `CLOUD_FLARE_API` and `CLOUD_FLARE_ACCOUNT_ID` back and re-run
Deploy. Keep the old account alive for at least a week before deleting it.
