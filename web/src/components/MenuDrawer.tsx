import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Category } from '../lib/types';

/**
 * Slide-in category menu, opened from the hamburger. Closes on backdrop click,
 * Escape, or any navigation — a drawer left open behind a new page is the most
 * common bug in this pattern.
 */
export function MenuDrawer({
  open,
  categories,
  onClose,
}: {
  open: boolean;
  categories: Category[];
  onClose: () => void;
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
        </div>
      </nav>
    </div>
  );
}
