import { useEffect } from 'react';

/**
 * Per-page `<title>`, meta description, canonical link and robots directive
 * — the storefront is a single-page app, so `index.html` only ever ships one
 * generic set of these, and every route was showing the same title/
 * description to Google and to anyone who shared a product link. Google does
 * execute the JS that sets these (documented, standard practice for SPAs),
 * even though — per Google's own December 2025 guidance — genuinely
 * time-sensitive markup is still better served in the initial HTML than
 * injected. Full server-side rendering is a real architecture change this
 * does not attempt; this is the practical ceiling for a client-rendered app.
 */

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

interface SeoOptions {
  title: string;
  description?: string;
  /** Only for a genuinely different canonical (e.g. a paginated view pointing at page 1). Defaults to the current URL. */
  canonical?: string;
  /** Account and order pages: real, useful to the shopper who has the link, of no value in a search result. */
  noindex?: boolean;
}

const SITE_TITLE_SUFFIX = ' — Arif Gadgets';

export function useSeo({ title, description, canonical, noindex = false }: SeoOptions): void {
  useEffect(() => {
    document.title = title.endsWith(SITE_TITLE_SUFFIX) ? title : `${title}${SITE_TITLE_SUFFIX}`;

    if (description) {
      upsertMeta('name', 'description', description);
      upsertMeta('property', 'og:description', description);
    } else {
      // Otherwise a page with no description of its own (cart, track, an
      // account view) keeps showing whichever page's description was set
      // last — stale copy in a shared link's preview card.
      document.querySelector('meta[name="description"]')?.remove();
      document.querySelector('meta[property="og:description"]')?.remove();
    }
    upsertMeta('property', 'og:title', document.title);
    upsertMeta('property', 'og:url', window.location.href);

    upsertLink('canonical', canonical ?? `${window.location.origin}${window.location.pathname}${window.location.search}`);

    if (noindex) {
      upsertMeta('name', 'robots', 'noindex, nofollow');
    } else {
      // Never let a stray noindex from a previous route (e.g. leaving /admin)
      // survive onto a page that should be fully indexable.
      document.querySelector('meta[name="robots"]')?.remove();
    }
  }, [title, description, canonical, noindex]);
}

/**
 * One JSON-LD block, keyed so several can coexist (the sitewide Organization
 * block, a page's own Product block) without one overwriting another. Google
 * does read structured data injected this way — documented, standard for a
 * client-rendered app — though for genuinely time-sensitive markup Google's
 * own guidance still prefers it in the initial HTML; this is the practical
 * ceiling without taking on full server-side rendering.
 */
export function useJsonLd(key: string, data: unknown): void {
  const json = data == null ? '' : JSON.stringify(data);

  useEffect(() => {
    if (!json) return;
    const id = `jsonld-${key}`;
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = json;

    return () => {
      document.getElementById(id)?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, json]);
}
