import { NavLink, Outlet } from 'react-router-dom';
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

// Owner-only, so it's kept out of NAV above (built for everyone) and added
// separately, gated on admin.role, right where it's rendered.
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

  if (!ready) return <Spinner />;
  if (!admin) return <Login />;

  return (
    <div className="admin">
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

        {admin?.role === 'owner' && (
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
          itself if ADMIN_GEMINI_API_KEY was never configured. */}
      <AdminAssistant />
    </div>
  );
}
