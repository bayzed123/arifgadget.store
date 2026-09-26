import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Category } from '../lib/types';
import type { Theme } from '../lib/store';

/**
 * Slide-in category menu, opened from the hamburger. Closes on backdrop click,
 * Escape, or any navigation — a drawer left open behind a new page is the most
 * common bug in this pattern.
 *
 * The header's own theme toggle is CSS-hidden below 900px (see styles.css's
 * .only-lg rule) with a comment saying it moves in here on phones — it never
 * actually did, leaving phone visitors with no way to switch themes at all.
 * theme/setTheme are passed down from Layout's single useTheme() rather than
 * calling the hook again here, so the header button (on wider screens) and
 * this drawer row can never disagree about the current theme.
 */
export function MenuDrawer({
  open,
  categories,
  onClose,
  theme,
  setTheme,
}: {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  theme: Theme;
  setTheme: (next: Theme) => void;
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Stop the page behind the drawer scrolling with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <div className={`drawer-root ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={onClose} />

      <nav className="drawer" aria-label="Main menu">
        <header className="drawer-head">
          <span>Main Menu</span>
          <button onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </header>

        <div className="drawer-list">
          {categories.map((category) => (
            <Link key={category.id} to={`/catalog?category=${category.slug}`} onClick={onClose}>
              <span className="ic" aria-hidden="true">
                {category.icon}
              </span>
              <span className="nm">{category.name}</span>
              <span className="cnt">{category.product_count}</span>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </div>

        <div className="drawer-list secondary">
          <Link to="/catalog?sort=discount" onClick={onClose} className="accent">
            <span className="ic" aria-hidden="true">
              🎁
            </span>
            <span className="nm">Offers</span>
            <span className="chev" aria-hidden="true">
              ›
            </span>
          </Link>
          <Link to="/catalog?sort=popular" onClick={onClose}>
            <span className="ic" aria-hidden="true">
              🔥
            </span>
            <span className="nm">Best sellers</span>
            <span className="chev" aria-hidden="true">
              ›
            </span>
          </Link>
          <Link to="/track" onClick={onClose}>
            <span className="ic" aria-hidden="true">
              🚚
            </span>
            <span className="nm">Track order</span>
            <span className="chev" aria-hidden="true">
              ›
            </span>
          </Link>
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <span className="ic" aria-hidden="true">
              {theme === 'dark' ? '☀️' : '🌙'}
            </span>
            <span className="nm">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
