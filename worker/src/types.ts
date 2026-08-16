export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
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
