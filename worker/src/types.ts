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
   * Three separate Gemini API keys, one per feature, kept apart on purpose:
   * a public, unauthenticated chat (support) can burn through its own quota
   * without ever touching the key the owner's private admin assistant runs
   * on, and the daily health check runs on a third again — one feature
   * misbehaving never disables another. Each is optional; without it that
   * one feature reports itself as not configured.
   */
  ADMIN_GEMINI_API_KEY?: string;
  SUPPORT_GEMINI_API_KEY?: string;
  ALERT_GEMINI_API_KEY?: string;
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
