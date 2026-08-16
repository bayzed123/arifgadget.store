import { mediaUrl } from '../lib/api';

/**
 * Product imagery. When a product has no uploaded photo we draw a deterministic
 * silhouette from its category instead of a grey box, so an unphotographed
 * catalogue still reads as designed rather than broken.
 */

const SHAPES: Record<string, (c: string) => JSX.Element> = {
  smartphones: (c) => (
    <g stroke={c} strokeWidth="3" fill="none">
      <rect x="74" y="34" width="52" height="92" rx="10" />
      <line x1="90" y1="44" x2="110" y2="44" strokeWidth="4" strokeLinecap="round" />
      <circle cx="100" cy="115" r="4" />
    </g>
  ),
  audio: (c) => (
    <g stroke={c} strokeWidth="3" fill="none">
      <path d="M62 96V82a38 38 0 0 1 76 0v14" strokeLinecap="round" />
      <rect x="54" y="92" width="20" height="34" rx="9" />
      <rect x="126" y="92" width="20" height="34" rx="9" />
    </g>
  ),
  wearables: (c) => (
    <g stroke={c} strokeWidth="3" fill="none">
      <rect x="76" y="62" width="48" height="48" rx="13" />
      <path d="M88 62V44h24v18M88 110v18h24v-18" strokeLinecap="round" />
      <path d="M100 76v10l7 5" strokeLinecap="round" />
    </g>
  ),
  power: (c) => (
    <g stroke={c} strokeWidth="3" fill="none">
      <rect x="78" y="38" width="44" height="84" rx="9" />
      <path d="M104 56 92 86h16l-12 26" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  computing: (c) => (
    <g stroke={c} strokeWidth="3" fill="none">
      <rect x="62" y="52" width="76" height="50" rx="6" />
      <path d="M50 114h100l-8-12H58z" strokeLinejoin="round" />
    </g>
  ),
  'smart-home': (c) => (
    <g stroke={c} strokeWidth="3" fill="none">
      <path d="M60 92 100 56l40 36" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M72 88v36h56V88" strokeLinejoin="round" />
      <circle cx="100" cy="104" r="9" />
    </g>
  ),
  cameras: (c) => (
    <g stroke={c} strokeWidth="3" fill="none">
      <rect x="56" y="62" width="88" height="58" rx="9" />
      <path d="M82 62l7-11h22l7 11" strokeLinejoin="round" />
      <circle cx="100" cy="92" r="17" />
      <circle cx="100" cy="92" r="7" />
    </g>
  ),
  accessories: (c) => (
    <g stroke={c} strokeWidth="3" fill="none">
      <path d="M100 44l34 20v40l-34 20-34-20V64z" strokeLinejoin="round" />
      <circle cx="100" cy="84" r="13" />
    </g>
  ),
};

const FALLBACK = (c: string) => (
  <g stroke={c} strokeWidth="3" fill="none">
    <path d="M56 72l44-24 44 24v44l-44 24-44-24z" strokeLinejoin="round" />
    <path d="M56 72l44 24 44-24M100 96v44" />
  </g>
);

/** Stable hue per product so the same item always looks the same. */
function hueFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

interface Props {
  name: string;
  imageUrl?: string;
  category?: string | null;
  className?: string;
}

export function ProductThumb({ name, imageUrl, category, className }: Props) {
  if (imageUrl) {
    return <img src={mediaUrl(imageUrl)} alt={name} loading="lazy" className={className} />;
  }

  const hue = hueFor(name);
  const draw = (category && SHAPES[category]) || FALLBACK;
  const id = `pt${hue}${name.length}`;

  return (
    <svg viewBox="0 0 200 160" className={className} role="img" aria-label={name}>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 32% 94%)`} />
          <stop offset="1" stopColor={`hsl(${(hue + 40) % 360} 28% 87%)`} />
        </linearGradient>
        <radialGradient id={`${id}gl`} cx="0.72" cy="0.22" r="0.62">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="200" height="160" fill={`url(#${id}bg)`} />
      <rect width="200" height="160" fill={`url(#${id}gl)`} />
      {draw(`hsl(${hue} 42% 34%)`)}
    </svg>
  );
}
