import { useEffect, useState } from 'react';
import { mediaUrl } from '../lib/api';
import { ProductThumb } from './ProductThumb';
import { Lightbox } from './Lightbox';

/**
 * The product's photos on the shop side.
 *
 * One big picture with a row of thumbnails beneath it, in the order the
 * dashboard set. With a single photo there is nothing to choose between, so
 * the strip stays away entirely rather than showing a lone thumbnail of the
 * picture already on screen.
 *
 * Tapping the big picture opens it full size. The frame here is square to match
 * the cards, which is right for the page but small for deciding whether to buy
 * something — so the full picture is one tap away.
 */

interface Props {
  name: string;
  imageUrl: string;
  gallery: string[];
  category?: string | null;
}

export function ProductGallery({ name, imageUrl, gallery, category }: Props) {
  // A link typed into the dashboard can point at something that has since
  // moved. Dropping it beats showing a shopper a broken-image icon.
  const [dead, setDead] = useState<string[]>([]);
  const images = [imageUrl, ...gallery].filter((url) => url && !dead.includes(url));
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  // A different product means a different set; keep the big picture on the
  // cover rather than on whatever index happened to be selected before.
  useEffect(() => {
    setActive(0);
    setDead([]);
    setZoomed(false);
  }, [imageUrl, gallery.join('|')]);

  const current = images[active] ?? images[0] ?? '';
  const hasPhoto = Boolean(current);

  return (
    <>
      {/*
        A button only when there is a real photo to enlarge. The drawn
        placeholder has no detail to reveal, so offering to open it would be a
        control that does nothing.
      */}
      {hasPhoto ? (
        <button
          type="button"
          className="pdp-media zoomable"
          onClick={() => setZoomed(true)}
          aria-label={`View ${name} picture full size`}
          title="Click to see the full picture"
        >
          <ProductThumb name={name} imageUrl={current} category={category} />
          <span className="pdp-zoom-hint" aria-hidden="true">
            🔍 Click to enlarge
          </span>
        </button>
      ) : (
        <div className="pdp-media">
          <ProductThumb name={name} imageUrl={current} category={category} />
        </div>
      )}

      {images.length > 1 && (
        <div className="pdp-thumbs" role="group" aria-label={`${name} pictures`}>
          {images.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              className={index === active ? 'active' : ''}
              aria-label={`Show picture ${index + 1} of ${images.length}`}
              aria-pressed={index === active}
              onClick={() => setActive(index)}
            >
              <img
                src={mediaUrl(url)}
                alt=""
                loading="lazy"
                onError={() => setDead((prev) => (prev.includes(url) ? prev : [...prev, url]))}
              />
            </button>
          ))}
        </div>
      )}

      {zoomed && hasPhoto && (
        <Lightbox
          images={images}
          index={active}
          onIndexChange={setActive}
          onClose={() => setZoomed(false)}
          name={name}
        />
      )}
    </>
  );
}
