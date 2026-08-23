import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

/**
 * Not a stored, dismissable log — a count that has to be marked read can
 * drift from what's actually true ("it still says 3 but I confirmed all of
 * them"). This recomputes what needs attention right now on every open, so
 * it can never claim something that isn't currently true. See
 * GET /api/admin/notifications on the Worker for the rules behind each count.
 */

interface NotificationItem {
  kind: string;
  count: number;
  label: string;
  href: string;
}

const POLL_MS = 60_000;

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  function load() {
    api<{ items: NotificationItem[]; total: number }>('/api/admin/notifications', { auth: true })
      .then((res) => setItems(res.items))
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const total = items.reduce((sum, i) => sum + i.count, 0);
  const badgeLabel = total > 99 ? '99+' : String(total);
  const ariaLabel = total > 0 ? `Notifications — ${total} need attention` : 'Notifications';

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {compact ? (
        // Icon-only, for the mobile top bar — a badge dot sits on the
        // button's own corner rather than inline, since there's no label
        // text here to put a count next to.
        <button
          type="button"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            fontSize: '1.1rem',
            cursor: 'pointer',
          }}
          onClick={() => {
            setOpen((v) => !v);
            load();
          }}
          aria-expanded={open}
          aria-label={ariaLabel}
        >
          <span aria-hidden="true">🔔</span>
          {total > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 17,
                height: 17,
                padding: '0 4px',
                borderRadius: 999,
                background: 'var(--brand, #ff7a18)',
                color: '#0a101e',
                fontSize: '0.63rem',
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center',
                lineHeight: 1,
                border: '2px solid var(--navy, #0a101e)',
              }}
            >
              {badgeLabel}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          className="icon-btn"
          style={{ color: '#cbd5e1', justifyContent: 'flex-start', width: '100%', position: 'relative' }}
          onClick={() => {
            setOpen((v) => !v);
            load();
          }}
          aria-expanded={open}
          aria-label={ariaLabel}
        >
          <span aria-hidden="true">🔔</span>
          Notifications
          {total > 0 && (
            <span
              aria-hidden="true"
              style={{
                marginLeft: 'auto',
                background: 'var(--brand, #d97528)',
                color: '#0a101e',
                fontSize: '0.7rem',
                fontWeight: 800,
                borderRadius: 999,
                padding: '1px 7px',
                lineHeight: 1.5,
              }}
            >
              {badgeLabel}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            ...(compact ? { right: 0, top: '100%', marginTop: 8 } : { left: 0, right: 0, bottom: '100%', marginBottom: 8 }),
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            zIndex: 190,
            minWidth: 260,
            maxWidth: 'min(320px, calc(100vw - 32px))',
          }}
        >
          {items.length === 0 ? (
            <div className="small muted" style={{ padding: '14px 16px' }}>
              Nothing needs attention right now.
            </div>
          ) : (
            items.map((item) => (
              <Link
                key={item.kind}
                to={item.href}
                onClick={() => setOpen(false)}
                className="small"
                style={{
                  display: 'block',
                  padding: '11px 16px',
                  borderTop: '1px solid var(--line)',
                  color: 'var(--ink)',
                }}
              >
                {item.label}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
