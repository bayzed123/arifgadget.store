import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import type { Env } from '../types';

export function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

export function notFound(message = 'Not found'): never {
  throw new HTTPException(404, { message });
}

export function conflict(message: string): never {
  throw new HTTPException(409, { message });
}

export function unauthorized(message = 'Unauthorized'): never {
  throw new HTTPException(401, { message });
}

/** Reads and validates a JSON body, rejecting anything that isn't an object. */
export async function readJson<T = Record<string, unknown>>(c: Context): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    badRequest('Request body must be valid JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    badRequest('Request body must be a JSON object');
  }
  return body as T;
}

export function requireString(value: unknown, field: string, max = 2000): string {
  if (typeof value !== 'string' || value.trim() === '') badRequest(`"${field}" is required`);
  const trimmed = (value as string).trim();
  if (trimmed.length > max) badRequest(`"${field}" must be ${max} characters or fewer`);
  return trimmed;
}

export function optionalString(value: unknown, fallback = '', max = 5000): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, max);
}

/** Non-negative integer, used for every money and quantity field. */
export function requireInt(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num)) {
    badRequest(`"${field}" must be a whole number`);
  }
  if ((num as number) < min || (num as number) > max) {
    badRequest(`"${field}" must be between ${min} and ${max}`);
  }
  return num as number;
}

export function optionalInt(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined || value === null || value === '') return fallback;
  return requireInt(value, 'value', min, max);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export async function audit(
  env: Env,
  actor: string,
  action: string,
  entity: string,
  entityId: string | number,
  detail = '',
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(actor, action, entity, String(entityId), detail)
    .run();
}
