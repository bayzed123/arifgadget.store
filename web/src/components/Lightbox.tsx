import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../lib/api';

/**
 * The full picture, over the page.
 *
 * On the product page the photo sits in a fixed square frame, which is right
 * for the layout but small for judging a product. Tapping it opens the picture
 * at whatever size the screen allows, and nothing else.
 *
 * Deliberately built to be easy to leave: Escape, the close button, or a tap on
 * the dark area all shut it. Arrow keys and swipe move between pictures. The
 * page behind cannot scroll while it is open, so closing it puts the shopper
 * back exactly where they were rather than somewhere further down.
 */

interface Props {
  images: string[];
  /** Which picture to open on. */
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  /** Product name, for the alt text and the heading read by screen readers. */
  name: string;
}

/** Below this a horizontal drag is a scroll, not a swipe. */
const SWIPE_PX = 45;

export function Lightbox({ images, index, onIndexChange, onClose, name }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const count = images.length;
  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setLoaded(false);
      onIndexChange((index + delta + count) % count);
    },
    [count, index, onIndexChange],
  );

  // Keyboard: escape to leave, arrows to move.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  /**
   * Hold the page still underneath. Without this, scrolling inside the overlay
   * scrolls the product page too, and closing lands the shopper somewhere else.
   */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Focus the close button so the escape route is the first thing reachable.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} — picture ${index + 1} of ${count}`}
      onClick={(event) => {
        // Only the backdrop closes. A click on the picture itself must not.
        if (event.target === event.currentTarget) onClose();
      }}
      onTouchStart={(event) => {
        touchX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchX.current === null) return;
        const delta = (event.changedTouches[0]?.clientX ?? 0) - touchX.current;
        touchX.current = null;
        if (Math.abs(delta) > SWIPE_PX) go(delta < 0 ? 1 : -1);
      }}
    >
      <button ref={closeRef} type="button" className="lightbox-close" aria-label="Close picture" onClick={onClose}>
        ✕
      </button>

      {count > 1 && (
        <button
          type="button"
          className="lightbox-nav prev"
          aria-label="Previous picture"
          onClick={() => go(-1)}
        >
          ‹
        </button>
      )}

      <figure className="lightbox-figure">
        <img
          key={images[index]}
          src={mediaUrl(images[index])}
          alt={`${name} — picture ${index + 1} of ${count}`}
          className={loaded ? 'ready' : ''}
          onLoad={() => setLoaded(true)}
        />
        {count > 1 && (
          <figcaption className="lightbox-count">
            {index + 1} / {count}
          </figcaption>
        )}
      </figure>

      {count > 1 && (
        <button type="button" className="lightbox-nav next" aria-label="Next picture" onClick={() => go(1)}>
          ›
        </button>
      )}
    </div>
  );
}
