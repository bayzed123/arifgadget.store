import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, useTheme } from '../../lib/store';
import { Logo } from '../../components/Logo';
import { Spinner } from '../../components/ui';
import { Login } from './Login';

const NAV = [
  { to: '/admin', end: true, icon: '📊', label: 'Dashboard' },
  { to: '/admin/products', icon: '📦', label: 'Products' },
  { to: '/admin/orders', icon: '🧾', label: 'Orders' },
  { to: '/admin/inventory', icon: '🏷️', label: 'Inventory' },
  { to: '/admin/content', icon: '📝', label: 'Content' },
  { to: '/admin/settings', icon: '⚙️', label: 'Settings' },
];

export function AdminLayout() {
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

        <div className="spacer" />

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
    </div>
  );
}
