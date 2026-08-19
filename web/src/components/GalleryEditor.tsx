import { useRef, useState, type DragEvent } from 'react';
import { ApiError, mediaUrl, uploadImages } from '../lib/api';
import { useToast } from '../lib/store';

/**
 * Every photo a product has, in one control.
 *
 * A shop like this lives on its photos, and one per product was never enough —
 * a phone case needs the front, the back, the corners and the box. So this
 * takes a whole selection at once, and takes it two ways: staff upload files
 * from the computer, or paste links to pictures that already live somewhere
 * (a supplier's site, a Facebook post). Both end up in the same list.
 *
 * The list is ordered and the first entry is the main photo — the one on the
 * cards, the cart and the invoice. Order is the whole point of the arrows: the
 * shop shows these in the sequence chosen here, so "make this one the cover"
 * is a real edit rather than a re-upload.
 */

/** Main photo plus eleven more. Matches MAX_GALLERY in the Worker. */
export const MAX_IMAGES = 12;

/** The number the client asked for; below it the control says so, gently. */
const RECOMMENDED = 5;

interface Props {
  /** Ordered image URLs. The first is the main photo. */
  images: string[];
  onChange: (next: string[]) => void;
  /** Used for the alt text while editing. */
  name?: string;
  /** Fewer columns and no help text, for the narrow live-preview panel. */
  compact?: boolean;
}

/** Accepts one URL or a whole pasted block of them. */
function splitUrls(raw: string): string[] {
  return raw
    .split(/[\n,\s]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

export function GalleryEditor({ images, onChange, name = 'Product', compact = false }: Props) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [urlText, setUrlText] = useState('');
  const [dragging, setDragging] = useState(false);
  // Pasted links can point anywhere, including at something that has since
  // been deleted. A tile that says so is worth more than a broken-image icon
  // with the alt text sprawling across it.
  const [broken, setBroken] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const room = MAX_IMAGES - images.length;

  /** Adds without duplicating, and never past the cap. */
  function add(urls: string[]) {
    const merged = [...images];
    let skipped = 0;
    for (const url of urls) {
      if (merged.includes(url)) continue;
      if (merged.length >= MAX_IMAGES) {
        skipped++;
        continue;
      }
      merged.push(url);
    }
    if (skipped) toast(`Only ${MAX_IMAGES} pictures fit — ${skipped} were left out`, 'error');
    if (merged.length !== images.length) onChange(merged);
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    if (room <= 0) {
      toast(`This product already has ${MAX_IMAGES} pictures. Remove one first.`, 'error');
      return;
    }

    const batch = files.slice(0, room);
    setUploading(true);
    try {
      const uploaded = await uploadImages(batch);
      add(uploaded.map((u) => u.url));
      toast(uploaded.length === 1 ? 'Picture uploaded' : `${uploaded.length} pictures uploaded`, 'success');
      if (files.length > batch.length) {
        toast(`Only ${batch.length} fitted — the rest were not uploaded`, 'error');
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) void upload(files);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function addUrls() {
    const urls = splitUrls(urlText);
    if (!urls.length) return;
    add(urls);
    setUrlText('');
  }

  return (
    <div className={`gallery-editor${compact ? ' compact' : ''}`}>
      <div
        className={`gallery-drop${dragging ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <button
          type="button"
          className="btn ghost sm"
          disabled={uploading || room <= 0}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? 'Uploading…' : '＋ Choose pictures'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void upload(files);
          }}
        />
        <span className="tiny dim">
          {compact ? 'or drop files here' : 'Select several at once, or drag them onto this box'}
        </span>
      </div>

      <div className="gallery-url">
        <input
          className="input"
          placeholder="or paste a picture link…"
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          onKeyDown={(e) => {
            // Enter inside a product form would otherwise submit the whole form.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            addUrls();
          }}
        />
        <button type="button" className="btn ghost sm" onClick={addUrls} disabled={!urlText.trim()}>
          Add
        </button>
      </div>

      {images.length > 0 && (
        <ul className="gallery-grid">
          {images.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className={`gallery-item${index === 0 ? ' is-main' : ''}${broken.includes(url) ? ' is-broken' : ''}`}
            >
              {broken.includes(url) ? (
                <span className="gallery-broken" title={`This link does not load: ${url}`}>
                  <span aria-hidden="true">🔗</span>
                  <span className="tiny">Bad link</span>
                </span>
              ) : (
                <img
                  src={mediaUrl(url)}
                  alt={`${name} picture ${index + 1}`}
                  loading="lazy"
                  onError={() => setBroken((prev) => (prev.includes(url) ? prev : [...prev, url]))}
                />
              )}
              {index === 0 && <span className="gallery-tag">Main</span>}
              <div className="gallery-tools">
                <button
                  type="button"
                  title="Move earlier"
                  aria-label={`Move picture ${index + 1} earlier`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  title="Move later"
                  aria-label={`Move picture ${index + 1} later`}
                  disabled={index === images.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  ›
                </button>
                <button
                  type="button"
                  className="danger"
                  title="Remove"
                  aria-label={`Remove picture ${index + 1}`}
                  onClick={() => remove(index)}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="tiny dim">
        {images.length} of {MAX_IMAGES} pictures
        {images.length === 0
          ? ` — add at least ${RECOMMENDED} so shoppers can see the product properly.`
          : images.length < RECOMMENDED
            ? ` — ${RECOMMENDED - images.length} more would show the product better.`
            : '. The first one is the main photo; use ‹ › to reorder.'}
      </p>

      {/*
        The size rule belongs where the pictures are chosen, not only in the
        guide. Square is the whole of it: every picture frame in the shop is
        1:1, so a square photo fills it with no empty strips down the sides.
      */}
      {!compact && (
        <p className="tiny dim">
          Best results: <strong>square photos, 1200 × 1200 pixels</strong>, on a plain white background, under
          5 MB each. Other shapes are never cropped — they just leave space at the sides.
        </p>
      )}
    </div>
  );
}
