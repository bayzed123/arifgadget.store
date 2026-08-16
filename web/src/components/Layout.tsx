import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { setCurrencySymbol } from '../lib/format';
import { useCart, useTheme } from '../lib/store';
import type { Category, PageLink, StoreSettings } from '../lib/types';
import { Logo } from './Logo';
import { PaymentBadges } from './PaymentBadges';
import { WhatsAppButton } from './WhatsAppButton';
import { MenuDrawer } from './MenuDrawer';
import { BottomNav } from './BottomNav';
import { OfferPopup } from './OfferPopup';

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
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Close the drawer whenever the route changes, including on back/forward.
  useEffect(() => setMenuOpen(false), [pathname, params]);

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
    navigate(trimmed ? `/catalog?q=${encodeURIComponent(trimmed)}` : '/catalog');
  }

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <div className="topbar">
        <div className="wrap">
          <span className="row gap-8 wrap-row">
            <span>🚚 Free delivery over ৳5,000</span>
            <span className="dot" aria-hidden="true">
              |
            </span>
            <span>📦 Ships in 48 hours</span>
          </span>
          <span className="row gap-12 wrap-row">
            {settings?.support_phone && (
              <a href={`tel:${settings.support_phone.replace(/\s|-/g, '')}`}>📞 {settings.support_phone}</a>
            )}
            <Link to="/track">Track order</Link>
          </span>
        </div>
      </div>

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
          <div className="footer-grid">
            <div>
              <div style={{ color: '#fff', marginBottom: 12 }}>
                <Logo />
              </div>
              <p className="small">
                Wholesale gadgets shipped factory-direct across Bangladesh. Volume pricing, live stock and a
                seven-day return window on every carton.
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
                <li>
                  <Link to="/admin">Staff dashboard</Link>
                </li>
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
      <WhatsAppButton number={settings?.whatsapp_number} storeName={settings?.store_name} />
      <MenuDrawer open={menuOpen} categories={categories} onClose={() => setMenuOpen(false)} />
      <BottomNav onOpenCategories={() => setMenuOpen(true)} />
    </>
  );
}
