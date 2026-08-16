import type { AdminClaims, CustomerClaims } from '../types';

type Claims = AdminClaims | CustomerClaims;

const enc = new TextEncoder();

const PBKDF2_ITERATIONS = 100_000;
const KEY_BITS = 256;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

/** Constant-time comparison so a wrong password can't be timed character by character. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  );
  return toBase64(bits);
}

export async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  return timingSafeEqual(enc.encode(actual), enc.encode(expected));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signToken(claims: Claims, secret: string): Promise<string> {
  const header = base64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(enc.encode(JSON.stringify(claims)));
  const body = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${base64url(signature)}`;
}

export async function verifyToken(token: string, secret: string): Promise<Claims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    base64urlDecode(signature),
    enc.encode(`${header}.${payload}`),
  );
  if (!valid) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(payload))) as Claims;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
    // A token minted before `kind` existed, or with an unknown kind, is not
    // trusted for anything — the holder simply signs in again.
    if (claims.kind !== 'admin' && claims.kind !== 'customer') return null;
    return claims;
  } catch {
    return null;
  }
}
