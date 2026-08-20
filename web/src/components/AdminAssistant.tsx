import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * The dashboard's built-in helper — available on every admin screen (mounted
 * once in AdminLayout), answers "how do I…" questions and questions about
 * the shop's current numbers. Grounded server-side (see adminAssistant.ts on
 * the Worker) with a live D1 snapshot pulled fresh on every message, so a
 * number it states is never stale or invented.
 *
 * Conversation lives only in this component's state — nothing is saved, so
 * a page reload starts fresh. That is a deliberate simplicity trade-off, not
 * a limitation staff need to work around: each question is grounded live
 * regardless of what came before it.
 */

interface Turn {
  role: 'user' | 'model';
  text: string;
}

const STARTERS = ['আজকে সেল কেমন হলো?', 'কিভাবে দ্বিতীয় Steadfast একাউন্ট যোগ করব?', 'কোন প্রোডাক্ট স্টক আউট আছে?'];

export function AdminAssistant() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ connected: boolean }>('/api/admin/assistant/status', { auth: true })
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
      const res = await api<{ ok: boolean; error: string; reply: string }>('/api/admin/assistant/chat', {
        method: 'POST',
        auth: true,
        body: { history: next },
      });
      if (!res.ok) {
        setError(res.error || 'Could not get a reply.');
      } else {
        setTurns((prev) => [...prev, { role: 'model', text: res.reply }]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the assistant.');
    } finally {
      setBusy(false);
    }
  }

  // Not configured (no ADMIN_GEMINI_API_KEY) — stay out of the way entirely
  // rather than showing a launcher that can only ever fail.
  if (configured === false) return null;

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 250 }}>
      {open && (
        <div
          role="dialog"
          aria-label="Admin assistant"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 'calc(100% + 12px)',
            width: 'min(380px, calc(100vw - 40px))',
            height: 'min(560px, calc(100vh - 120px))',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
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
              <strong style={{ fontSize: '0.9rem' }}>🤖 Admin assistant</strong>
              <div className="tiny dim">Ask anything about the dashboard or today's numbers</div>
            </div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {turns.length === 0 && (
              <div className="stack gap-8">
                <p className="small muted">যেকোনো প্রশ্ন করুন — dashboard ব্যবহার নিয়ে, বা আজকের numbers নিয়ে।</p>
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
              <div style={{ alignSelf: 'flex-start', color: 'var(--ink-3)', fontSize: '0.86rem' }} className="tiny dim">
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
        className="btn primary"
        aria-expanded={open}
        aria-label={open ? 'Close admin assistant' : 'Open admin assistant'}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          padding: 0,
          fontSize: '1.4rem',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {open ? '✕' : '🤖'}
      </button>
    </div>
  );
}
