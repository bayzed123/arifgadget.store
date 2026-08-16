/** Base URL of the Worker API. Injected at build time by the deploy workflow. */
export const API_BASE = (
  import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8787'
).replace(/\/$/, '');

const TOKEN_KEY = 'ag.admin.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — session stays in memory only */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the staff token. */
  auth?: boolean;
  /** Send the customer token. Both are Bearer tokens but never interchangeable. */
  customerAuth?: boolean;
  signal?: AbortSignal;
}

const CUSTOMER_TOKEN_KEY = 'ag.customer.token';

function customerToken(): string | null {
  try {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, customerAuth = false, signal } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (customerAuth) {
    const token = customerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('Could not reach the store. Check your connection and try again.', 0);
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${res.status})`;

    // A dead session should not leave a stale token behind.
    if (res.status === 401 && auth) setToken(null);
    if (res.status === 401 && customerAuth) {
      try {
        localStorage.removeItem(CUSTOMER_TOKEN_KEY);
      } catch {
        /* ignore */
      }
    }
    throw new ApiError(message, res.status);
  }

  return payload as T;
}

/** Multipart upload — bypasses the JSON body path above. */
export async function uploadImage(file: File): Promise<{ url: string; key: string }> {
  const form = new FormData();
  form.append('file', file);

  const token = getToken();
  const res = await fetch(`${API_BASE}/api/admin/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const payload = (await res.json().catch(() => null)) as { url?: string; key?: string; error?: string } | null;
  if (!res.ok || !payload?.url) {
    throw new ApiError(payload?.error ?? 'Upload failed', res.status);
  }
  return { url: payload.url, key: payload.key! };
}

/** Product images are stored as Worker-relative paths; absolute URLs pass through. */
export function mediaUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}
