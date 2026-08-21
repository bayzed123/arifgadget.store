import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * The storefront's support chat — a floating launcher on every page,
 * mirrored to the left of the WhatsApp button (see .support-fab in
 * styles.css) so the two never overlap. Grounded server-side in real store
 * settings and published policy pages (see supportAssistant.ts on the
 * Worker); it has no access to individual orders or accounts — for those it
 * points shoppers at Track your order or the WhatsApp/phone contact instead.
 *
 * Hides itself entirely if SUPPORT_GEMINI_API_KEY was never configured, same
 * as the admin assistant — no launcher that can only ever fail.
 */

interface Turn {
  role: 'user' | 'model';
  text: string;
}

const STARTERS = ['ডেলিভারি চার্জ কত?', 'কিভাবে পেমেন্ট করব?', 'রিটার্ন পলিসি কী?'];

export function SupportChat() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ connected: boolean }>('/api/support/status')
      .then((res) => setConfigured(res.connected))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setError('');
    setInput('');
    const next = [...turns, { role: 'user' as const, text: message }];
    setTurns(next);
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; error: string; reply: string }>('/api/support/chat', {
        method: 'POST',
        body: { history: next },
      });
      if (!res.ok) {
        setError(res.error || 'Could not get a reply.');
      } else {
        setTurns((prev) => [...prev, { role: 'model', text: res.reply }]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach support chat.');
    } finally {
      setBusy(false);
    }
  }

  if (configured === false) return null;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Support chat"
          style={{
            position: 'fixed',
            left: 18,
            bottom: 84,
            width: 'min(360px, calc(100vw - 36px))',
            height: 'min(520px, calc(100vh - 160px))',
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 95,
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div>
              <strong style={{ fontSize: '0.9rem' }}>💬 Ask us anything</strong>
              <div className="tiny dim">Delivery, payment, returns — instant answers</div>
            </div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {turns.length === 0 && (
              <div className="stack gap-8">
                <p className="small muted">প্রশ্ন করুন — ডেলিভারি, পেমেন্ট, রিটার্ন পলিসি নিয়ে।</p>
                {STARTERS.map((s) => (
                  <button key={s} type="button" className="btn ghost sm" style={{ textAlign: 'left' }} onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                style={{
                  alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  background: t.role === 'user' ? 'var(--brand, #d97528)' : 'var(--surface-inset)',
                  color: t.role === 'user' ? '#0a101e' : 'var(--ink)',
                  borderRadius: 12,
                  padding: '8px 12px',
                  fontSize: '0.86rem',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                }}
              >
                {t.text}
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start' }} className="tiny dim">
                লিখছে…
              </div>
            )}
            {error && (
              <div className="alert error tiny" style={{ alignSelf: 'stretch' }}>
                {error}
              </div>
            )}
          </div>

          <form
            style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--line)', flexShrink: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="প্রশ্ন লিখুন…"
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="btn primary sm" disabled={busy || !input.trim()}>
              পাঠান
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="support-fab"
        aria-expanded={open}
        aria-label={open ? 'Close support chat' : 'Open support chat'}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" style={{ fontSize: '1.3rem', lineHeight: 1 }}>
          {open ? '✕' : '💬'}
        </span>
        <span className="support-fab-text">Ask us anything</span>
      </button>
    </>
  );
}
