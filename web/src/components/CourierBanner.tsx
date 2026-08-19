import type { CourierConnection } from '../lib/types';

/**
 * The Steadfast connection, explained.
 *
 * This replaced a red badge whose only explanation was a `title` tooltip. A
 * courier that will not connect is one of the more expensive things that can
 * quietly break in this shop — no parcel gets booked, no delivery status
 * updates — and the person who has to fix it is usually not the person who
 * wrote the deploy. So it says which of the four failures it is, what Steadfast
 * itself replied, and what to do next.
 *
 * It never shows a key. Whether each key is present, and how long it is, is
 * enough to tell "the secret was never set" from "the secret holds the wrong
 * thing", which is the distinction that matters when diagnosing.
 */

const HEADLINE: Record<CourierConnection['reason'], string> = {
  ok: 'Steadfast connected',
  not_configured: 'Steadfast keys are not set',
  rejected: 'Steadfast refused these keys',
  courier_down: 'Steadfast is having trouble',
  unreachable: 'Could not reach Steadfast',
};

interface Props {
  state: CourierConnection | null;
  /** Rendered beside the headline — the page's own refresh control. */
  action?: React.ReactNode;
}

export function CourierBanner({ state, action }: Props) {
  if (!state) return null;

  const { credentials: creds } = state;

  if (state.connected) {
    return (
      <div className="courier-banner ok">
        <div className="row gap-8 wrap-row">
          <span className="badge ok">
            <span className="dot" /> {HEADLINE.ok}
          </span>
          {state.balance !== null && (
            <span className="small muted">
              Courier account balance ৳{state.balance.toLocaleString('en-BD')}
            </span>
          )}
        </div>
        {action}
      </div>
    );
  }

  return (
    <div className="courier-banner bad">
      <div className="stack gap-8" style={{ flex: 1, minWidth: 0 }}>
        <div className="row gap-8 wrap-row">
          <span className="badge low">
            <span className="dot" /> {HEADLINE[state.reason]}
          </span>
          {state.status ? <span className="tiny dim mono">HTTP {state.status}</span> : null}
        </div>

        {/* Only attribute words to Steadfast when Steadfast actually said them.
            With no keys set, nothing was sent to them at all. */}
        {state.message &&
          (state.reason === 'not_configured' ? (
            <p className="small">{state.message}</p>
          ) : (
            <p className="small">
              <strong>Steadfast replied:</strong> {state.message}
            </p>
          ))}

        {state.fix && <p className="small muted">{state.fix}</p>}

        {/* Presence and length, never a character of the value. */}
        <p className="tiny dim mono">
          API key {creds.api_key_present ? `present (${creds.api_key_length} characters)` : 'MISSING'} · secret
          key {creds.secret_key_present ? `present (${creds.secret_key_length} characters)` : 'MISSING'} ·{' '}
          {creds.base_url}
        </p>
      </div>
      {action}
    </div>
  );
}
