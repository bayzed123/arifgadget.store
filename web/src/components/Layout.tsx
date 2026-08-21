import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { setCurrencySymbol } from '../lib/format';
import { useCart, useTheme, useWishlist } from '../lib/store';
import type { Category, PageLink, StoreSettings } from '../lib/types';
import { Logo } from './Logo';
import { PaymentBadges } from './PaymentBadges';
import { ChatLauncher } from './ChatLauncher';
import { MenuDrawer } from './MenuDrawer';
import { BottomNav } from './BottomNav';
import { OfferPopup } from './OfferPopup';
import { ImageZoom } from './ImageZoom';
import { trackPageView, trackSearch } from '../lib/analytics';
import { announceRoute, isPreviewMessage } from '../lib/previewBridge';
import { useJsonLd } from '../lib/seo';

export function Layout() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [company, setCompany] = useState<PageLink[]>([]);
  const [policy, setPolicy] = useState<PageLink[]>([]);
  const [theme, setTheme] = useTheme();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const cart = useCart();
  const wishlist = useWishlist();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Close the drawer whenever the route changes, including on back/forward.
  useEffect(() => setMenuOpen(false), [pathname, params]);

  /**
   * Tell the dashboard which page is on screen when it is previewing the shop.
   * A no-op for real visitors — nothing is framing their browser.
   */
  useEffect(() => {
    announceRoute(pathname);
  }, [pathname]);

  /** The dashboard asks for a reload after saving an edit. */
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data) || event.data.type !== 'reload') return;
      window.location.reload();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // The base tag has send_page_view off, so the router owns every page_view —
  // including the first. Without this a single-page app reports one screen.
  useEffect(() => {
    trackPageView(pathname + (params.toString() ? `?${params}` : ''));
  }, [pathname, params]);

  useEffect(() => {
    api<{ categories: Category[] }>('/api/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([]));

    api<StoreSettings>('/api/settings')
      .then((res) => {
        setSettings(res);
        setCurrencySymbol(res.currency_symbol);
      })
      .catch(() => setSettings(null));

    api<{ company: PageLink[]; policy: PageLink[] }>('/api/pages')
      .then((res) => {
        setCompany(res.company);
        setPolicy(res.policy);
      })
      .catch(() => {
        setCompany([]);
        setPolicy([]);
      });
  }, []);

  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);

  function search(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) trackSearch(trimmed);
    navigate(trimmed ? `/catalog?q=${encodeURIComponent(trimmed)}` : '/catalog');
  }

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  // Sitewide structured data — Organization (so a knowledge-panel-style
  // result has somewhere to pull from) and WebSite with a SearchAction
  // (the documented way to earn the sitelinks search box, and genuinely
  // true here: /catalog?q= is the real search this site runs on).
  useJsonLd(
    'sitewide',
    settings
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              name: settings.store_name || 'Arif Gadgets',
              url: window.location.origin,
              logo: `${window.location.origin}${import.meta.env.BASE_URL}brand/logo-mark.svg`,
              ...(settings.support_phone
                ? { contactPoint: { '@type': 'ContactPoint', telephone: settings.support_phone, contactType: 'customer service' } }
                : {}),
              ...(settings.facebook_url ? { sameAs: [settings.facebook_url] } : {}),
            },
            {
              '@type': 'WebSite',
              name: settings.store_name || 'Arif Gadgets',
              url: window.location.origin,
              potentialAction: {
                '@type': 'SearchAction',
                target: `${window.location.origin}/catalog?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
              },
            },
          ],
        }
      : null,
  );

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="header">
        <div className="wrap">
          <button
            className="icon-btn menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <span style={{ fontSize: '1.25rem', lineHeight: 1 }} aria-hidden="true">
              ☰
            </span>
          </button>

          <Link to="/" className="brand-link" aria-label="Arif Gadgets home">
            <Logo />
          </Link>

          <form className="searchbar" onSubmit={search} role="search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search phones, audio, chargers, SKUs…"
              aria-label="Search products"
            />
            <button type="submit">Search</button>
          </form>

          <div className="header-actions">
            <button
              className="icon-btn only-lg"
              onClick={() => setTheme(nextTheme)}
              aria-label={`Switch to ${nextTheme} theme`}
              title={`Switch to ${nextTheme} theme`}
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            <NavLink to="/account" className={({ isActive }) => `icon-btn only-lg ${isActive ? 'active' : ''}`}>
              <span aria-hidden="true">{wishlist.ids.size > 0 ? '♥' : '♡'}</span>
              <span className="hide-sm">Wishlist</span>
              {wishlist.ids.size > 0 && (
                <span className="cart-count">{wishlist.ids.size > 99 ? '99+' : wishlist.ids.size}</span>
              )}
            </NavLink>
            <NavLink to="/cart" className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}>
              <span aria-hidden="true">🛒</span>
              <span className="hide-sm">Cart</span>
              {cart.count > 0 && <span className="cart-count">{cart.count > 99 ? '99+' : cart.count}</span>}
            </NavLink>
            <NavLink to="/account" className={({ isActive }) => `icon-btn only-lg ${isActive ? 'active' : ''}`}>
              <span aria-hidden="true">👤</span>
              <span className="hide-sm">Account</span>
            </NavLink>
          </div>
        </div>
      </header>

      <nav className="catnav" aria-label="Product categories">
        <div className="wrap">
          <NavLink to="/catalog" end className={({ isActive }) => (isActive && !params.get('category') ? 'active' : '')}>
            All products
          </NavLink>
          {categories.map((category) => (
            <NavLink
              key={category.id}
              to={`/catalog?category=${category.slug}`}
              className={params.get('category') === category.slug ? 'active' : ''}
            >
              <span aria-hidden="true">{category.icon}</span> {category.name}
            </NavLink>
          ))}
        </div>
      </nav>

      <main id="main" className="page">
        <div className="wrap">
          <Outlet context={{ categories, settings }} />
        </div>
      </main>

      <footer className="footer">
        <div className="wrap">
          {/*
            Moved down here from a card beside the hero banner. Help belongs at
            the end of the page: someone who has finished reading and still has
            a question is exactly who needs it, and it is on every page rather
            than only the home page.
          */}
          {(settings?.support_whatsapp_url || settings?.support_email) && (
            <div className="help-band">
              <div>
                <h4>Need help?</h4>
                <p className="small">
                  Ask about a product, an order or delivery — we reply fast.
                </p>
              </div>
              <div className="help-actions">
                {settings?.support_whatsapp_url && (
                  <a
                    className="btn primary"
                    href={settings.support_whatsapp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    💬 Chat on WhatsApp
                  </a>
                )}
                {settings?.support_email && (
                  <a className="btn on-dark" href={`mailto:${settings.support_email}`}>
                    ✉️ {settings.support_email}
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="footer-grid">
            <div>
              <div style={{ color: '#fff', marginBottom: 12 }}>
                <Logo />
              </div>
              {/*
                Was the same "wholesale, priced by the carton" pitch as the old
                hero banner. This is a gadget shop people buy one phone from,
                so the blurb leads with that and mentions bulk after.
              */}
              <p className="small">
                Genuine phones, audio, wearables and accessories, delivered across Bangladesh. Live stock, cash
                on delivery, and a seven-day return window. Buying in quantity? The price drops automatically.
              </p>
              {settings?.owner_name && (
                <p className="tiny dim" style={{ marginTop: 8 }}>
                  Owner: {settings.owner_name}
                </p>
              )}

              {settings?.facebook_url && (
                <div className="social-row">
                  <a
                    href={settings.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Arif Gadgets on Facebook"
                    title="Follow us on Facebook"
                  >
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="#fff" aria-hidden="true">
                      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.19 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.75 8.44-4.92 8.44-9.94Z" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
            <div>
              <h4>About Us</h4>
              <ul className="footer-links">
                {company.map((page) => (
                  <li key={page.slug}>
                    <Link to={`/page/${page.slug}`}>{page.title}</Link>
                  </li>
                ))}
                <li>
                  <Link to="/track">Order Tracking</Link>
                </li>
                <li>
                  <Link to="/blog">Blog</Link>
                </li>
                <li>
                  <Link to="/press">Press Coverage</Link>
                </li>
              </ul>
            </div>

            <div>
              <h4>Policy</h4>
              <ul className="footer-links">
                {policy.map((page) => (
                  <li key={page.slug}>
                    <Link to={`/page/${page.slug}`}>{page.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Visit or call us</h4>
              <div className="contact-list">
                {settings?.store_address && (
                  <span className="row-i">
                    <span className="ic" aria-hidden="true">
                      📍
                    </span>
                    <span>{settings.store_address}</span>
                  </span>
                )}
                {settings?.support_phone && (
                  <span className="row-i">
                    <span className="ic" aria-hidden="true">
                      📞
                    </span>
                    <a href={`tel:${settings.support_phone.replace(/\s|-/g, '')}`}>{settings.support_phone}</a>
                  </span>
                )}
                {settings?.support_phone_2 && (
                  <span className="row-i">
                    <span className="ic" aria-hidden="true">
                      📱
                    </span>
                    <a href={`tel:${settings.support_phone_2.replace(/\s|-/g, '')}`}>{settings.support_phone_2}</a>
                  </span>
                )}
                {settings?.support_email && (
                  <span className="row-i">
                    <span className="ic" aria-hidden="true">
                      ✉️
                    </span>
                    <a href={`mailto:${settings.support_email}`}>{settings.support_email}</a>
                  </span>
                )}
                <span className="row-i">
                  <span className="ic" aria-hidden="true">
                    🚚
                  </span>
                  <Link to="/track">Track your order</Link>
                </span>
              </div>
            </div>
            <div>
              <h4>Business</h4>
              <ul>
                <li>Bulk &amp; reseller pricing</li>
                <li>Nationwide courier delivery</li>
                <li>Wholesale accounts welcome</li>
              </ul>
            </div>
          </div>

          <div style={{ marginBottom: 26 }}>
            <h4>We accept</h4>
            <PaymentBadges />
          </div>

          <div className="footer-bot">
            <span>
              © {new Date().getFullYear()} {settings?.store_name ?? 'Arif Gadgets'}. All rights reserved.
            </span>

            <span className="credits">
              {settings?.credit_dev_name && (
                <span>
                  <span className="k">Dev: </span>
                  {settings.credit_dev_url ? (
                    <a href={settings.credit_dev_url} target="_blank" rel="noopener noreferrer">
                      {settings.credit_dev_name}
                    </a>
                  ) : (
                    settings.credit_dev_name
                  )}
                </span>
              )}

              {settings?.credit_dev_name && settings?.credit_author_name && (
                <span className="sep" aria-hidden="true">
                  ·
                </span>
              )}

              {settings?.credit_author_name && (
                <span>
                  <span className="k">Developer: </span>
                  {settings.credit_author_url ? (
                    <a href={settings.credit_author_url} target="_blank" rel="noopener noreferrer">
                      {settings.credit_author_name}
                    </a>
                  ) : (
                    settings.credit_author_name
                  )}
                </span>
              )}
            </span>
          </div>
        </div>
      </footer>

      <OfferPopup />
      {/* Hover any picture to see it enlarged; click one to open it full screen. */}
      <ImageZoom />
      <ChatLauncher number={settings?.whatsapp_number} storeName={settings?.store_name} />
      <MenuDrawer open={menuOpen} categories={categories} onClose={() => setMenuOpen(false)} />
      <BottomNav onOpenCategories={() => setMenuOpen(true)} />
    </>
  );
}
