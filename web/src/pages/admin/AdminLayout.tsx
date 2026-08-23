import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useTheme } from '../../lib/store';
import { Logo } from '../../components/Logo';
import { Spinner } from '../../components/ui';
import { Login } from './Login';
import { ImageZoom } from '../../components/ImageZoom';
import { NotificationBell } from '../../components/NotificationBell';
import { AdminAssistant } from '../../components/AdminAssistant';
import { useSeo } from '../../lib/seo';

const NAV = [
  { to: '/admin', end: true, icon: '📊', label: 'Dashboard' },
  // Second in the list on purpose: it is the screen staff live in day to day.
  { to: '/admin/preview', icon: '👁️', label: 'Live shop & edit' },
  { to: '/admin/products', icon: '📦', label: 'Products' },
  { to: '/admin/orders', icon: '🧾', label: 'Orders' },
  { to: '/admin/customers', icon: '👥', label: 'Customers' },
  { to: '/admin/reviews', icon: '⭐', label: 'Ratings' },
  { to: '/admin/analytics', icon: '📈', label: 'Analytics' },
  { to: '/admin/calculators', icon: '🧮', label: 'Calculators' },
  { to: '/admin/inventory', icon: '🏷️', label: 'Inventory' },
  { to: '/admin/offers', icon: '📣', label: 'Offers & popup' },
  { to: '/admin/content', icon: '📝', label: 'Content' },
  { to: '/admin/settings', icon: '⚙️', label: 'Settings' },
];

// Management-only (owner + admin, not plain staff), so it's kept out of NAV
// above (built for everyone) and added separately, gated on admin.role,
// right where it's rendered.
const OWNER_NAV = { to: '/admin/staff', icon: '🧑‍💼', label: 'Staff accounts' };

export function AdminLayout() {
  // robots.txt already disallows the whole /admin path — this is the
  // belt-and-suspenders layer, so a page never becomes indexable just
  // because a crawler reached it some other way (an external link, a stale
  // cache) that skipped robots.txt entirely. Set once here, above every
  // admin screen, rather than on each one individually.
  useSeo({ title: 'Admin', noindex: true });
  const { admin, ready, signOut } = useAuth();
  const [theme, setTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on every navigation — a drawer left open behind
  // a new page is the most common bug in this pattern (see MenuDrawer.tsx).
  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  if (!ready) return <Spinner />;
  if (!admin) return <Login />;

  const canSeeStaff = admin?.role === 'owner' || admin?.role === 'admin';

  return (
    <div className="admin">
      {/* Mobile only (see .admin-topbar in styles.css) — the full sidebar
          below is hidden under 900px so it never dumps 12+ links above the
          page content. Hamburger on the left opens the same nav as a
          slide-in drawer; the bell stays reachable on the right. */}
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-topbar-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={menuOpen}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <NavLink to="/" className="admin-topbar-logo" aria-label="Arif Gadgets">
          <Logo />
        </NavLink>
        <NotificationBell compact />
      </header>

      <div className={`drawer-root admin-menu-drawer ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen}>
        <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
        <nav className="drawer" aria-label="Admin menu">
          <header className="drawer-head">
            <span>Admin menu</span>
            <button onClick={() => setMenuOpen(false)} aria-label="Close menu">
              ✕
            </button>
          </header>

          <div className="drawer-list">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'accent' : '')}>
                <span className="ic" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="nm">{item.label}</span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </NavLink>
            ))}
            {canSeeStaff && (
              <NavLink to={OWNER_NAV.to} className={({ isActive }) => (isActive ? 'accent' : '')}>
                <span className="ic" aria-hidden="true">
                  {OWNER_NAV.icon}
                </span>
                <span className="nm">{OWNER_NAV.label}</span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </NavLink>
            )}
            <NavLink to="/admin/guide">
              <span className="ic" aria-hidden="true">
                📖
              </span>
              <span className="nm">বাংলা গাইড</span>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </NavLink>
          </div>

          <div className="drawer-list secondary">
            <NavLink to="/">
              <span className="ic" aria-hidden="true">
                🏬
              </span>
              <span className="nm">View storefront</span>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </NavLink>
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              <span className="ic" aria-hidden="true">
                {theme === 'dark' ? '☀️' : '🌙'}
              </span>
              <span className="nm">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
            </button>
            <button type="button" onClick={signOut}>
              <span className="ic" aria-hidden="true">
                🚪
              </span>
              <span className="nm">
                Sign out — <span className="dim">{admin.name}</span>
              </span>
            </button>
          </div>
        </nav>
      </div>

      <nav className="sidebar" aria-label="Admin navigation">
        <NavLink to="/" className="logo" style={{ background: 'none' }}>
          <Logo />
        </NavLink>

        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {canSeeStaff && (
          <NavLink to={OWNER_NAV.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span aria-hidden="true">{OWNER_NAV.icon}</span>
            {OWNER_NAV.label}
          </NavLink>
        )}

        {/* Bangla walkthrough of every screen — deliberately loud, the owner
            should never have to hunt for the manual. */}
        <NavLink
          to="/admin/guide"
          className={({ isActive }) => `nav-guide ${isActive ? 'active' : ''}`}
        >
          <span aria-hidden="true">📖</span> বাংলা গাইড
        </NavLink>

        <div className="spacer" />

        <NotificationBell />

        <NavLink to="/">
          <span aria-hidden="true">🏬</span> View storefront
        </NavLink>
        <button
          className="icon-btn"
          style={{ color: '#93a3b8', justifyContent: 'flex-start' }}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>

        <div className="who">
          <strong style={{ color: '#fff', display: 'block' }}>{admin.name}</strong>
          <span className="truncate" style={{ display: 'block' }}>
            @{admin.username}
          </span>
          <button
            className="btn ghost sm"
            style={{ marginTop: 9, width: '100%', borderColor: 'rgba(255,255,255,0.2)', color: '#cbd5e1' }}
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="admin-main">
        <Outlet />
      </div>

      {/* Hover any picture to see it enlarged; click one to open it full screen. */}
      <ImageZoom />

      {/* Available on every admin screen — see AdminAssistant.tsx. Hides
          itself if Workers AI is not available. */}
      <AdminAssistant />
    </div>
  );
}
