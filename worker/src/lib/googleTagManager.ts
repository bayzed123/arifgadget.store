/**
 * Google Tag Manager — read-only visibility into the container already
 * installed on the site (see web/index.html), for staff who cannot easily
 * read the GTM console themselves. This walks the same account → container →
 * workspace → tags/triggers/variables hierarchy a person clicking through
 * tagmanager.google.com would, and reports exactly what it finds — an empty
 * workspace is reported as empty, never padded out to look configured.
 *
 * GTM itself does not report *performance* (how often a tag fired, whether
 * it errored) — that lives in GA4, which the Analytics panel already covers.
 * This is "what is set up", not "how did it do".
 */

import type { Env } from '../types';
import { googleAccessToken, type GoogleAuthResult } from './googleAuth';

const SCOPE = 'https://www.googleapis.com/auth/tagmanager.readonly';
const API = 'https://www.googleapis.com/tagmanager/v2';

// The public container ID pasted into web/index.html's own GTM snippet —
// fixed to the one container this site actually runs, not user-selectable,
// since there is only ever one right answer for "the container on our
// site". Exported so admin.ts and devReport.ts share the same constant
// rather than each hardcoding their own copy of it.
export const GTM_PUBLIC_ID = 'GTM-MGQ6S4HX';

export type GtmResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fromAuth<T>(auth: GoogleAuthResult): GtmResult<T> | null {
  return auth.ok ? null : { ok: false, error: auth.error };
}

async function get<T>(token: string, path: string): Promise<GtmResult<T>> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: `Tag Manager replied with ${res.status} and a non-JSON body.` };
  }
  if (!res.ok) {
    const err = (payload as { error?: { message?: string } })?.error?.message;
    return { ok: false, error: err || `Tag Manager returned ${res.status}.` };
  }
  return { ok: true, data: payload as T };
}

export interface GtmTag {
  tagId: string;
  name: string;
  type: string;
  paused: boolean;
}

export interface GtmTrigger {
  triggerId: string;
  name: string;
  type: string;
}

export interface GtmVariable {
  variableId: string;
  name: string;
  type: string;
}

export interface GtmSummary {
  accountName: string;
  containerName: string;
  publicId: string;
  workspaceName: string;
  tags: GtmTag[];
  triggers: GtmTrigger[];
  variables: GtmVariable[];
  liveVersionName: string | null;
}

/**
 * Everything about the container matching `publicId` (the "GTM-XXXXXXX" ID
 * pasted into the site's own head snippet) that this service account can see.
 * Searches every account it has access to, since a container's numeric IDs
 * are not derivable from the public ID alone.
 */
export async function gtmSummary(env: Env, publicId: string): Promise<GtmResult<GtmSummary>> {
  const auth = await googleAccessToken(env, SCOPE);
  const early = fromAuth<GtmSummary>(auth);
  if (early) return early;
  const token = (auth as { ok: true; token: string }).token;

  const accounts = await get<{ account?: { accountId: string; name: string }[] }>(token, '/accounts');
  if (!accounts.ok) return accounts;

  for (const account of accounts.data.account ?? []) {
    const containers = await get<{ container?: { containerId: string; name: string; publicId: string }[] }>(
      token,
      `/accounts/${account.accountId}/containers`,
    );
    if (!containers.ok) continue;

    const container = (containers.data.container ?? []).find((c) => c.publicId === publicId);
    if (!container) continue;

    const base = `/accounts/${account.accountId}/containers/${container.containerId}`;

    const workspaces = await get<{ workspace?: { workspaceId: string; name: string }[] }>(token, `${base}/workspaces`);
    const workspace = workspaces.ok ? workspaces.data.workspace?.[0] : undefined;
    if (!workspace) {
      return { ok: false, error: `Found the "${container.name}" container but it has no workspace to read tags from.` };
    }
    const wbase = `${base}/workspaces/${workspace.workspaceId}`;

    const [tags, triggers, variables, live] = await Promise.all([
      get<{ tag?: GtmTag[] }>(token, `${wbase}/tags`),
      get<{ trigger?: GtmTrigger[] }>(token, `${wbase}/triggers`),
      get<{ variable?: GtmVariable[] }>(token, `${wbase}/variables`),
      get<{ name?: string }>(token, `${base}/versions:live`),
    ]);

    return {
      ok: true,
      data: {
        accountName: account.name,
        containerName: container.name,
        publicId: container.publicId,
        workspaceName: workspace.name,
        tags: tags.ok ? (tags.data.tag ?? []) : [],
        triggers: triggers.ok ? (triggers.data.trigger ?? []) : [],
        variables: variables.ok ? (variables.data.variable ?? []) : [],
        liveVersionName: live.ok ? (live.data.name ?? null) : null,
      },
    };
  }

  return {
    ok: false,
    error: `No container with the public ID "${publicId}" is visible to this service account. Grant it access under GTM → Admin → User Management, or check the ID is right.`,
  };
}
