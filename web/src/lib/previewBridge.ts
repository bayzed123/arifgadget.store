/**
 * The link between the live storefront and the dashboard previewing it.
 *
 * The dashboard shows the real shop in an iframe. For "edit what I am looking
 * at" to work, the frame has to say what it is looking at — an iframe's URL
 * cannot be watched from outside, because a single-page app changes routes
 * without ever firing a `load` event.
 *
 * So the shop announces its own route on every navigation, and the dashboard
 * answers by asking it to reload after a save. Two small messages, no shared
 * state, and the storefront behaves exactly as normal when nobody is framing
 * it — which is every real customer.
 */

/** Marks our messages so a stray postMessage from anything else is ignored. */
export const PREVIEW_SOURCE = 'arif-gadgets-preview';

export interface PreviewRouteMessage {
  source: typeof PREVIEW_SOURCE;
  type: 'route';
  path: string;
}

export interface PreviewReloadMessage {
  source: typeof PREVIEW_SOURCE;
  type: 'reload';
}

export type PreviewMessage = PreviewRouteMessage | PreviewReloadMessage;

/** True only when this window is inside another one from the same origin. */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin parent — reading window.top throws. Not our dashboard, so
    // treat it as not framed and stay silent.
    return false;
  }
}

/**
 * Tells the parent which route the shop is on.
 *
 * Targeted at our own origin rather than "*", so the route never leaks to a
 * page that has embedded the shop without permission.
 */
export function announceRoute(path: string): void {
  if (!isFramed()) return;
  const message: PreviewRouteMessage = { source: PREVIEW_SOURCE, type: 'route', path };
  try {
    window.parent.postMessage(message, window.location.origin);
  } catch {
    /* a parent that will not accept the message is not the shop's problem */
  }
}

/** Type guard for the dashboard's side of the conversation. */
export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === PREVIEW_SOURCE
  );
}
