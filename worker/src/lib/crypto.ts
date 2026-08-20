/**
 * At-rest encryption for secrets the dashboard lets staff type in directly —
 * starting with courier API keys (see lib/steadfast.ts and the
 * `courier_accounts` table).
 *
 * Worker secrets (STEADFAST_API_KEY and friends) never touch the database at
 * all, which is as safe as a credential gets. A key added from Settings has
 * to live somewhere the Worker can read it without a redeploy, and D1 is that
 * place — but a plain column would mean anyone who could read the database
 * (a backup, an export, a future bug in an admin query) could read every
 * courier's live API credentials in one query. AES-GCM keyed from JWT_SECRET
 * — a value that already never leaves Worker secrets — means a database
 * export alone is not enough to recover a key.
 *
 * This is defence in depth, not a replacement for keeping the database
 * private: the encryption key and the ciphertext both ultimately live on the
 * same Cloudflare account. It is exactly the same trade every "store an
 * OAuth token encrypted in our database" system makes.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const IV_BYTES = 12; // AES-GCM's recommended nonce size.

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

/** One AES-256 key, deterministically derived from JWT_SECRET so nothing new needs provisioning. */
async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`courier-secret-v1:${secret}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Encrypts one secret for storage. The IV travels with the ciphertext — it isn't secret, just single-use. */
export async function encryptSecret(secret: string, plaintext: string): Promise<string> {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return toBase64(combined);
}

/**
 * Reverses encryptSecret. Only called at the moment a courier request is
 * actually being made — never to answer "what does the dashboard show", which
 * always uses the stored length instead (see credentialShape in steadfast.ts).
 */
export async function decryptSecret(secret: string, stored: string): Promise<string> {
  const key = await encryptionKey(secret);
  const combined = fromBase64(stored);
  const iv = combined.slice(0, IV_BYTES);
  const cipher = combined.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return dec.decode(plain);
}
