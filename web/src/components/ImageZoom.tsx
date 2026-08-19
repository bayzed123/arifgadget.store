import { useEffect, useState } from 'react';
import { Lightbox } from './Lightbox';

/**
 * See any picture properly, from anywhere.
 *
 * Product photos appear all over this site at thumbnail size — catalogue cards,
 * the cart, the dashboard's product table, the gallery editor. At 48 or 220
 * pixels you cannot tell two black chargers apart, and the only way to check
 * used to be opening the product.
 *
 * So: hovering a picture with a mouse shows it enlarged beside the cursor, and
 * clicking one opens it full screen.
 *
 * It works by listening on the document rather than by every component opting
 * in. That is deliberate — pictures here are added and removed constantly as
 * staff upload, filter and paginate, and a delegated listener covers whatever
 * is on screen at the time without each of those places having to remember to
 * wire itself up.
 */

/** Every picture worth enlarging. One list, so there is one place to add more. */
const ZOOMABLE = [
  '.card-media img', // catalogue and home cards
  '.thumb-sm img', // dashboard tables
  '.cart-line .media img', // cart and checkout lines
  '.gallery-item img', // the dashboard's picture editor
  '.pdp-thumbs img', // the strip under a product photo
  '.press-thumb img',
  '.blog-cover img',
].join(', ');

/**
 * Containers whose pictures belong to one set, so the arrows in the full-screen
 * view step through siblings rather than showing a single picture with no way
 * out but closing.
 */
const GROUPS = '.gallery-grid, .pdp-thumbs, .prod-grid, .prod-rail, .cat-grid, tbody';

/** Long enough that sweeping the mouse across a grid does not flash previews. */
const HOVER_DELAY_MS = 320;

/** The preview is offset from the cursor so it never sits under the pointer. */
const CURSOR_GAP = 22;

interface HoverState {
  src: string;
  alt: string;
  x: number;
  y: number;
}

interface FullState {
  images: string[];
  index: number;
  name: string;
}

/** Pulls the whole set a picture belongs to, so the arrows have somewhere to go. */
function siblingsOf(img: HTMLImageElement): { images: string[]; index: number } {
  const group = img.closest(GROUPS);
  const src = img.currentSrc || img.src;
  if (!group) return { images: [src], index: 0 };

  const all = Array.from(group.querySelectorAll<HTMLImageElement>(ZOOMABLE)).map(
    (el) => el.currentSrc || el.src,
  );
  // De-duplicate: a card and its thumbnail can point at the same file.
  const unique = [...new Set(all)];
  const index = Math.max(unique.indexOf(src), 0);
  return { images: unique.length ? unique : [src], index };
}

export function ImageZoom() {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [full, setFull] = useState<FullState | null>(null);

  useEffect(() => {
    // No hover on a touch screen — showing a preview there would mean a panel
    // appearing on a tap and swallowing the tap that was meant for the link.
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      setHover(null);
    };

    function imageUnder(target: EventTarget | null): HTMLImageElement | null {
      if (!(target instanceof Element)) return null;
      const img = target.closest<HTMLImageElement>('img');
      return img && img.matches(ZOOMABLE) ? img : null;
    }

    function onOver(event: MouseEvent) {
      if (!canHover) return;
      const img = imageUnder(event.target);
      if (!img) return;
      const src = img.currentSrc || img.src;
      if (!src) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setHover({ src, alt: img.alt || 'Product picture', x: event.clientX, y: event.clientY });
      }, HOVER_DELAY_MS);
    }

    function onMove(event: MouseEvent) {
      if (!canHover) return;
      if (!imageUnder(event.target)) {
        clear();
        return;
      }
      setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
    }

    function onOut(event: MouseEvent) {
      if (!canHover) return;
      if (imageUnder(event.target)) clear();
    }

    function onClick(event: MouseEvent) {
      const img = imageUnder(event.target);
      if (!img) return;

      // A picture inside a link or a button already means something — a card
      // opens its product, a thumbnail selects itself. Hijacking that click
      // would take away the action the shopper was actually reaching for.
      if (img.closest('a, button')) return;

      const src = img.currentSrc || img.src;
      if (!src) return;
      event.preventDefault();
      clear();
      const { images, index } = siblingsOf(img);
      setFull({ images, index, name: img.alt || 'Picture' });
    }

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('click', onClick);
    // A preview pinned to a cursor position is wrong the moment the page moves.
    window.addEventListener('scroll', clear, true);
    window.addEventListener('blur', clear);

    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('click', onClick);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('blur', clear);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // The panel is placed on whichever side of the cursor has room, so it never
  // hangs off the edge of the screen.
  const panel = (() => {
    if (!hover) return null;
    const size = Math.min(360, window.innerWidth - 40, window.innerHeight - 40);
    const right = hover.x + CURSOR_GAP;
    const left = right + size > window.innerWidth ? hover.x - CURSOR_GAP - size : right;
    const top = Math.min(Math.max(hover.y - size / 2, 12), window.innerHeight - size - 12);
    return { left, top, size };
  })();

  return (
    <>
      {hover && panel && (
        <div
          className="zoom-peek"
          style={{ left: panel.left, top: panel.top, width: panel.size, height: panel.size }}
          aria-hidden="true"
        >
          <img src={hover.src} alt="" />
        </div>
      )}

      {full && (
        <Lightbox
          images={full.images}
          index={full.index}
          onIndexChange={(index) => setFull((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setFull(null)}
          name={full.name}
        />
      )}
    </>
  );
}
