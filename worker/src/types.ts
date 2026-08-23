export interface Env {
  DB: D1Database;
  /**
   * Absent when the Cloudflare account has not enabled R2 — the deploy drops
   * the binding rather than failing, so image upload degrades instead of
   * taking the whole store down.
   */
  MEDIA?: R2Bucket;
  CACHE: KVNamespace;
  JWT_SECRET?: string;
  STORE_NAME: string;
  ALLOWED_ORIGINS: string;
  /**
   * Steadfast courier credentials, set as Worker secrets by the deploy. Both
   * optional: without them the courier panel reports itself as not connected
   * and every other part of the shop carries on unchanged.
   */
  STEADFAST_API_KEY?: string;
  STEADFAST_SECRET_KEY?: string;
  /** Override for the courier's base URL. Only useful for their sandbox. */
  STEADFAST_BASE_URL?: string;
  /**
   * Secret path segment for the delivery webhook. Absent means the webhook
   * route does not exist at all — the shop still works, updates just arrive
   * when someone looks rather than the moment they happen.
   */
  STEADFAST_WEBHOOK_TOKEN?: string;
  /**
   * A Google Cloud service-account key (the whole downloaded JSON file, as
   * one string), used to call GA4 and Search Console with real data for the
   * Analytics panel. The account itself needs Viewer access granted in each
   * Google product separately — this key only proves who is asking.
   * Optional: without it the panel reports itself as not connected.
   */
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  /**
   * Cloudflare Workers AI — powers the admin assistant, support chat, daily
   * health check, and weekly developer report (see lib/ai.ts). Optional in
   * the type only to mirror MEDIA's pattern (an account without Workers AI
   * enabled loses these features gracefully rather than the Worker failing
   * to boot); in practice every account gets Workers AI's free tier with no
   * signup or billing card needed. Replaced four separate Gemini API keys
   * this codebase used to carry after the Google Cloud project behind them
   * was denied access to the Gemini API outright — see lib/ai.ts's own
   * comment for the full story.
   */
  AI?: Ai;
  /**
   * Secret path segment that fires the weekly developer report on demand —
   * the GitHub Actions "Run workflow" button, for when Monday's cron or the
   * dashboard's Run now isn't convenient. Same shape as
   * STEADFAST_WEBHOOK_TOKEN: absent means the route 404s outright rather
   * than existing-but-locked, so nothing about it is visible from outside
   * without already holding the real token.
   */
  DEV_REPORT_TRIGGER_TOKEN?: string;
  /**
   * Resend API key for order-alert emails — an "an order just came in" email
   * to whoever runs the shop, separate from the weekly developer report (that
   * one goes to the developer's own Doc/Sheet, this goes to the owner's
   * inbox). Optional: without a key, or without ORDER_ALERT_EMAIL below, no
   * email is sent and checkout is completely unaffected either way.
   */
  RESEND_API_KEY?: string;
  /** Where the new-order alert email goes. Unset disables the alert entirely. */
  ORDER_ALERT_EMAIL?: string;
  /**
   * Sender address for alert emails. Defaults to Resend's shared sandbox
   * sender (onboarding@resend.dev) in email.ts if unset — fine for an
   * internal alert-to-self, no domain verification required. Set this once a
   * domain is verified in the Resend account for a branded from-address.
   */
  ALERT_EMAIL_FROM?: string;
}

export interface AdminClaims {
  /**
   * Distinguishes staff tokens from customer tokens. Both are signed with the
   * same secret, so without this a customer session would satisfy the admin
   * guard. Checked explicitly on every admin route.
   */
  kind: 'admin';
  sub: number;
  email: string;
  /** Sign-in name; also what the audit log and stock ledger record. */
  username: string;
  name: string;
  role: 'owner' | 'admin' | 'staff';
  exp: number;
}

export interface CustomerClaims {
  kind: 'customer';
  sub: number;
  phone: string;
  name: string;
  exp: number;
}

export type Variables = {
  admin: AdminClaims;
  customer: CustomerClaims;
};
