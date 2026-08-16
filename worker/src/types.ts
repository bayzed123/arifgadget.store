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
  sub: number;
  email: string;
  /** Sign-in name; also what the audit log and stock ledger record. */
  username: string;
  name: string;
  role: 'owner' | 'admin' | 'staff';
  exp: number;
}

export type Variables = {
  admin: AdminClaims;
};
