/** Minimal Cloudflare REST client shared by the deploy scripts. */

const API = 'https://api.cloudflare.com/client/v4';

export function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    console.error(`\nMissing ${name}.`);
    console.error(`Add it under Settings → Secrets and variables → Actions in the repository.\n`);
    process.exit(1);
  }
  return value;
}

/**
 * Reads the first of several env names that is set. The repository uses
 * CLOUD_FLARE_* secret names; the CLOUDFLARE_* spellings are what wrangler
 * itself reads, so both are accepted.
 */
function firstOf(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  console.error(`\nMissing ${names[0]}.`);
  console.error('Add it under Settings → Secrets and variables → Actions in the repository.');
  console.error(`Accepted names: ${names.join(', ')}\n`);
  process.exit(1);
}

export function client() {
  const token = firstOf(['CLOUD_FLARE_API', 'CLOUDFLARE_API_TOKEN']);
  const accountId = firstOf(['CLOUD_FLARE_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID']);

  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API}/accounts/${accountId}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }

    if (!res.ok || payload?.success === false) {
      const detail = payload?.errors?.map((e) => `${e.code} ${e.message}`).join('; ') ?? text.slice(0, 300);
      const error = new Error(`${method} ${path} → ${res.status}: ${detail}`);
      error.status = res.status;
      error.errors = payload?.errors ?? [];
      throw error;
    }

    return payload?.result;
  }

  return { call, accountId };
}

/** True when Cloudflare rejected the create because the resource already exists. */
export function isAlreadyExists(err) {
  return (err.errors ?? []).some((e) => /already exists|duplicate/i.test(e.message ?? ''));
}
