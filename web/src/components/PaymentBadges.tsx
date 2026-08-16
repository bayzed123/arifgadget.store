/**
 * Accepted-payment badges for the footer.
 *
 * These are plain wordmark badges in each provider's brand colour, drawn here
 * so the page stays self-contained and offline-safe. They are not the official
 * logo artwork — when the merchant account is live, replace each `<svg>` with
 * the provider's supplied asset from their brand kit.
 */

function Badge({
  label,
  bg,
  children,
}: {
  label: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <span className="pay-badge" style={{ background: bg }} title={`We accept ${label}`}>
      {children}
    </span>
  );
}

export function PaymentBadges() {
  return (
    <div className="pay-row" role="list" aria-label="Accepted payment methods">
      <span role="listitem">
        <Badge label="bKash" bg="#E2136E">
          <svg viewBox="0 0 96 28" height="20" role="img" aria-label="bKash">
            <circle cx="14" cy="14" r="11" fill="#fff" opacity="0.22" />
            <path d="M9 8.5 19.5 12 12.5 14.5 20 19.5 8.5 17.5 11.5 13.5Z" fill="#fff" />
            <text
              x="32"
              y="19.5"
              fill="#fff"
              fontSize="15"
              fontWeight="700"
              fontFamily="var(--font)"
              letterSpacing="-0.3"
            >
              bKash
            </text>
          </svg>
        </Badge>
      </span>

      <span role="listitem">
        <Badge label="Nagad" bg="#F15A22">
          <svg viewBox="0 0 96 28" height="20" role="img" aria-label="Nagad">
            <path
              d="M14 4.5a9.5 9.5 0 1 0 9.2 11.9"
              fill="none"
              stroke="#fff"
              strokeWidth="3.4"
              strokeLinecap="round"
            />
            <path d="M14 9.2a4.8 4.8 0 1 0 4.7 5.9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
            <text
              x="32"
              y="19.5"
              fill="#fff"
              fontSize="15"
              fontWeight="700"
              fontFamily="var(--font)"
              letterSpacing="-0.3"
            >
              Nagad
            </text>
          </svg>
        </Badge>
      </span>

      <span role="listitem">
        <Badge label="Rocket" bg="#8C3494">
          <svg viewBox="0 0 100 28" height="20" role="img" aria-label="Rocket">
            <path d="M5 17.5 23 5l-6.5 17.5-3.2-5.2-4.6 3.2 1-4.6Z" fill="#fff" />
            <text
              x="30"
              y="19.5"
              fill="#fff"
              fontSize="15"
              fontWeight="700"
              fontFamily="var(--font)"
              letterSpacing="-0.3"
            >
              Rocket
            </text>
          </svg>
        </Badge>
      </span>

      <span role="listitem">
        <Badge label="Cash on delivery" bg="#0f7b52">
          <svg viewBox="0 0 148 28" height="20" role="img" aria-label="Cash on delivery">
            <rect x="5" y="8" width="20" height="13" rx="2.5" fill="none" stroke="#fff" strokeWidth="2" />
            <circle cx="15" cy="14.5" r="3.2" fill="#fff" />
            <text
              x="32"
              y="19.5"
              fill="#fff"
              fontSize="13"
              fontWeight="700"
              fontFamily="var(--font)"
              letterSpacing="-0.2"
            >
              Cash on delivery
            </text>
          </svg>
        </Badge>
      </span>
    </div>
  );
}
