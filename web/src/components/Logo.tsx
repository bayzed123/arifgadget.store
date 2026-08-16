/**
 * Inlined rather than loaded from /brand/logo.svg so the wordmark can pick up
 * `currentColor` and stay legible in both themes.
 */

function Mark({ idPrefix }: { idPrefix: string }) {
  return (
    <g transform="translate(4 4)">
      <g fill={`url(#${idPrefix}gold)`} opacity="0.9">
        <rect x="0" y="18" width="5" height="5" rx="1.6" />
        <rect x="0" y="29.5" width="5" height="5" rx="1.6" />
        <rect x="0" y="41" width="5" height="5" rx="1.6" />
        <rect x="59" y="18" width="5" height="5" rx="1.6" />
        <rect x="59" y="29.5" width="5" height="5" rx="1.6" />
        <rect x="59" y="41" width="5" height="5" rx="1.6" />
      </g>
      <rect x="4" y="4" width="56" height="56" rx="17" fill={`url(#${idPrefix}chip)`} />
      <rect x="5" y="5" width="54" height="54" rx="16" fill="none" stroke={`url(#${idPrefix}rim)`} strokeWidth="1.5" />
      <g stroke="#22D3EE" strokeWidth="1.1" strokeLinecap="round" opacity="0.45" fill="none">
        <path d="M12 20v-4a4 4 0 0 1 4-4h4" />
        <path d="M52 44v4a4 4 0 0 1-4 4h-4" />
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 47 31.2 18" stroke={`url(#${idPrefix}gold)`} strokeWidth="5.4" />
        <path d="M45 47 32.8 18" stroke="#FFD75E" strokeWidth="5.4" opacity="0.62" />
        <path d="M24.6 36.4h14.8" stroke="#22D3EE" strokeWidth="3.4" />
      </g>
      <circle cx="32" cy="16.4" r="3.2" fill="#FFD75E" />
      <circle cx="32" cy="16.4" r="6.2" fill="#FFD75E" opacity="0.16" />
    </g>
  );
}

function Defs({ idPrefix }: { idPrefix: string }) {
  return (
    <defs>
      <linearGradient id={`${idPrefix}chip`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#16233C" />
        <stop offset="1" stopColor="#0A101E" />
      </linearGradient>
      <linearGradient id={`${idPrefix}gold`} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#FF7A18" />
        <stop offset="0.55" stopColor="#F5B301" />
        <stop offset="1" stopColor="#FFD75E" />
      </linearGradient>
      <linearGradient id={`${idPrefix}rim`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFD75E" stopOpacity="0.85" />
        <stop offset="0.5" stopColor="#FF7A18" stopOpacity="0.25" />
        <stop offset="1" stopColor="#22D3EE" stopOpacity="0.55" />
      </linearGradient>
      <linearGradient id={`${idPrefix}word`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#FF7A18" />
        <stop offset="1" stopColor="#FFD75E" />
      </linearGradient>
    </defs>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  const p = compact ? 'lc' : 'lf';

  if (compact) {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72" role="img" aria-label="Arif Gadgets">
        <Defs idPrefix={p} />
        <Mark idPrefix={p} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 348 72" width="348" height="72" role="img" aria-label="Arif Gadgets">
      <Defs idPrefix={p} />
      <Mark idPrefix={p} />
      <g fontFamily="var(--font)">
        <text x="84" y="38" fontSize="27" fontWeight="700" letterSpacing="1.2" fill="currentColor">
          ARIF
        </text>
        <text x="152" y="38" fontSize="27" fontWeight="700" letterSpacing="1.2" fill={`url(#${p}word)`}>
          GADGETS
        </text>
        <text x="85" y="55" fontSize="9.5" fontWeight="600" letterSpacing="3.5" fill="currentColor" opacity="0.55">
          PREMIUM TECH MARKETPLACE
        </text>
      </g>
    </svg>
  );
}
