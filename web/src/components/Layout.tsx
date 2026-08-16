import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { setCurrencySymbol } from '../lib/format';
import { useCart, useTheme } from '../lib/store';
import type { Category, StoreSettings } from '../lib/types';
import { Logo } from './Logo';
import { PaymentBadges } from './PaymentBadges';
import { WhatsAppButton } from './WhatsAppButton';

export function Layout() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [theme, setTheme] = useTheme();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const cart = useCart();
  const navigate = useNavigate();

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
              className="icon-btn"
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
            <NavLink to="/admin" className="icon-btn">
              <span aria-hidden="true">🔐</span>
              <span className="hide-sm">Admin</span>
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
            </div>
            <div>
              <h4>Shop</h4>
              <ul>
                {categories.slice(0, 5).map((category) => (
                  <li key={category.id}>
                    <Link to={`/catalog?category=${category.slug}`}>{category.name}</Link>
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
            <span>© {new Date().getFullYear()} Arif Gadgets. All rights reserved.</span>
            <span>Built on Cloudflare Workers · D1</span>
          </div>
        </div>
      </footer>

      <WhatsAppButton number={settings?.whatsapp_number} storeName={settings?.store_name} />
    </>
  );
}
