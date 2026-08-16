import { NavLink, useLocation, useSearchParams } from 'react-router-dom';

/** Line icons drawn inline so the bar stays crisp and needs no icon font. */
const icons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  ),
  category: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </svg>
  ),
  offer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 15.5 15.5 8.5" />
      <circle cx="9.2" cy="9.2" r="1.4" />
      <circle cx="14.8" cy="14.8" r="1.4" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3.1" />
      <path d="M6.4 18.6a6.4 6.4 0 0 1 11.2 0" />
    </svg>
  ),
};

/**
 * Fixed bottom tab bar — the primary navigation on phones, where most of this
 * shop's traffic will be. Hidden from large screens, which use the header.
 */
export function BottomNav({ onOpenCategories }: { onOpenCategories: () => void }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();

  const onOffers = pathname === '/catalog' && params.get('sort') === 'discount';

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
        {icons.home}
        <span>Home</span>
      </NavLink>

      <button type="button" onClick={onOpenCategories} aria-label="Browse categories">
        {icons.category}
        <span>Category</span>
      </button>

      <NavLink to="/catalog?sort=discount" className={onOffers ? 'active' : ''}>
        {icons.offer}
        <span>Offer</span>
      </NavLink>

      {/* Four tabs only; the cart keeps its badge in the header. */}
      <NavLink to="/account" className={({ isActive }) => (isActive ? 'active' : '')}>
        {icons.user}
        <span>Sign In</span>
      </NavLink>
    </nav>
  );
}
