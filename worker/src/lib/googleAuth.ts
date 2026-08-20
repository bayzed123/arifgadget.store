/**
 * Server-to-server Google API access via a service account — the same
 * mechanism GA4, Search Console and Sheets all share once the account has
 * been granted access inside each product. This file only proves *who* is
 * asking; what that identity can see is decided entirely on Google's side by
 * whichever access the owner granted the service account's email.
 *
 * The flow (RFC 7523, "JWT Bearer Token"): sign a short-lived JWT with the
 * service account's private key, hand it to Google's token endpoint, get
 * back an access token good for about an hour. No client secret, no
 * redirect, no human in the loop — which is exactly what a Worker needs,
 * since nothing here can pop open a browser to ask someone to sign in.
 *
 * Access tokens are cached in KV per scope so a page that calls this twice
 * in one render doesn't sign a fresh JWT and round-trip to Google twice.
 */

import type { Env } from '../types';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const enc = new TextEncoder();

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Strips the PEM header/footer and decodes the base64 body to raw DER bytes. */
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

function parseKey(env: Env): ServiceAccountKey | null {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed as ServiceAccountKey;
  } catch {
    // A malformed secret is reported by the caller as "not connected", the
    // same as a missing one — never as a crash surfaced to the dashboard.
    return null;
  }
}

export const googleConfigured = (env: Env): boolean => parseKey(env) !== null;

async function signedAssertion(key: ServiceAccountKey, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(
    enc.encode(
      JSON.stringify({
        iss: key.client_email,
        scope,
        aud: key.token_uri ?? 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const body = `${header}.${payload}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(key.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, enc.encode(body));
  return `${body}.${base64url(signature)}`;
}

export type GoogleAuthResult = { ok: true; token: string } | { ok: false; error: string };

/**
 * An access token good for the given scope. Cached in KV under a key scoped
 * to the scope string itself, since GA4 and Search Console ask for different
 * scopes and a token for one is not valid for the other.
 */
export async function googleAccessToken(env: Env, scope: string): Promise<GoogleAuthResult> {
  const key = parseKey(env);
  if (!key) {
    return {
      ok: false,
      error: 'No Google service account is connected. Add GOOGLE_SERVICE_ACCOUNT_JSON as a repository secret and deploy.',
    };
  }

  const cacheKey = `google:token:${scope}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) return { ok: true, token: cached };

  try {
    const assertion = await signedAssertion(key, scope);
    const res = await fetch(key.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    const text = await res.text();
    let payload: { access_token?: string; expires_in?: number; error_description?: string; error?: string };
    try {
      payload = JSON.parse(text);
    } catch {
      return { ok: false, error: `Google's token endpoint replied with ${res.status} and a non-JSON body.` };
    }

    if (!res.ok || !payload.access_token) {
      return {
        ok: false,
        error:
          payload.error_description ||
          payload.error ||
          `Google refused this service account for scope "${scope}" (${res.status}). Check that the account has been granted access.`,
      };
    }

    // A minute of slack so a token is never handed out moments before Google
    // itself would have expired it.
    const ttl = Math.max(60, (payload.expires_in ?? 3600) - 60);
    await env.CACHE.put(cacheKey, payload.access_token, { expirationTtl: ttl });
    return { ok: true, token: payload.access_token };
  } catch {
    return { ok: false, error: 'Could not reach Google to authenticate.' };
  }
}

/** The service account's own email — shown in the dashboard so staff can confirm it matches what they granted access to. */
export function googleServiceAccountEmail(env: Env): string | null {
  return parseKey(env)?.client_email ?? null;
}
