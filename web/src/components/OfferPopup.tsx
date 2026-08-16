import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';

interface Banner {
  id: number;
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  cta_label: string;
  placement: 'popup' | 'home' | 'both';
}

const SEEN_KEY = 'ag.offer.seen';

/**
 * Pages where a modal would be an obstacle rather than a promotion: the
 * shopper is already committed and mid-task.
 */
const QUIET_PATHS = ['/checkout', '/cart', '/account', '/admin', '/track'];

/** Remembers which banners this browser has already dismissed. */
function readSeen(): number[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

/**
 * Offer popup shown automatically to visitors. Appears once per banner per
 * browser — an offer that reappears on every page load is an ad, not a
 * promotion, and shoppers learn to close it without reading.
 */
export function OfferPopup() {
  const { pathname } = useLocation();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [visible, setVisible] = useState(false);

  const quiet = QUIET_PATHS.some((path) => pathname.startsWith(path));

  useEffect(() => {
    if (quiet) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    api<{ banners: Banner[] }>('/api/banners')
      .then((res) => {
        if (cancelled) return;
        const seen = readSeen();
        const next = res.banners.find(
          (b) => (b.placement === 'popup' || b.placement === 'both') && !seen.includes(b.id),
        );
        if (!next) return;

        setBanner(next);
        // Let the page paint first; an instant modal reads as a popup blocker test.
        timer = setTimeout(() => setVisible(true), 1200);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [quiet]);

  function dismiss() {
    setVisible(false);
    if (!banner) return;
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...readSeen(), banner.id].slice(-40)));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, banner]);

  if (!banner || !visible || quiet) return null;

  const internal = banner.link_url.startsWith('/');

  return (
    <div className="offer-backdrop" onClick={(e) => e.target === e.currentTarget && dismiss()} role="presentation">
      <div className="offer-modal" role="dialog" aria-modal="true" aria-labelledby="offer-title">
        <button className="offer-close" onClick={dismiss} aria-label="Close offer">
          ✕
        </button>

        {banner.image_url && (
          <div className="offer-image">
            <img src={mediaUrl(banner.image_url)} alt="" />
          </div>
        )}

        <div className="offer-content">
          <span className="offer-tag">🎁 Special offer</span>
          <h2 id="offer-title">{banner.title}</h2>
          {banner.subtitle && <p className="muted">{banner.subtitle}</p>}

          <div className="row gap-8 wrap-row" style={{ marginTop: 6 }}>
            {banner.link_url &&
              (internal ? (
                <Link to={banner.link_url} className="btn primary" onClick={dismiss}>
                  {banner.cta_label || 'Shop the offer'}
                </Link>
              ) : (
                <a href={banner.link_url} target="_blank" rel="noopener noreferrer" className="btn primary" onClick={dismiss}>
                  {banner.cta_label || 'Shop the offer'}
                </a>
              ))}
            <button className="btn ghost" onClick={dismiss}>
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inline strip for the homepage, for banners set to `home` or `both`. */
export function OfferStrip() {
  const [banners, setBanners] = useState<Banner[]>([]);

  useEffect(() => {
    api<{ banners: Banner[] }>('/api/banners')
      .then((res) => setBanners(res.banners.filter((b) => b.placement === 'home' || b.placement === 'both')))
      .catch(() => setBanners([]));
  }, []);

  if (banners.length === 0) return null;

  return (
    <div className="offer-strip" style={{ marginBottom: 26 }}>
      {banners.map((banner) => (
        <div className="offer-chip" key={banner.id}>
          <span className="ic" aria-hidden="true">
            🎁
          </span>
          <div>
            <strong>{banner.title}</strong>
            {banner.subtitle && <div className="tiny">{banner.subtitle}</div>}
          </div>
          {banner.link_url && banner.link_url.startsWith('/') && (
            <Link className="btn primary sm" to={banner.link_url}>
              {banner.cta_label || 'View'}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
