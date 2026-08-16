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
