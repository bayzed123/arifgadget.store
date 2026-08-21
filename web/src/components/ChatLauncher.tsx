import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { trackContact } from '../lib/analytics';
import { waLink, WhatsAppIcon } from './WhatsAppButton';

/**
 * One floating chat launcher for the whole storefront — replaces what used
 * to be two separate floating buttons (WhatsApp on one corner, the AI
 * support chat on the other), which read as clutter rather than two
 * genuinely different tools. Now there's a single button; opening it shows
 * a small chooser between the two, and picking one shows only that one —
 * the other stays out of the way until the chooser is reopened.
 *
 * Hides the AI option entirely (falling back to a plain WhatsApp button,
 * same as before this merge) if SUPPORT_GEMINI_API_KEY was never
 * configured — never a chooser with an option that can only fail.
 */

interface Turn {
  role: 'user' | 'model';
  text: string;
}

const STARTERS = ['ডেলিভারি চার্জ কত?', 'কিভাবে পেমেন্ট করব?', 'রিটার্ন পলিসি কী?'];

type View = 'choose' | 'ai';

export function ChatLauncher({ number, storeName }: { number?: string; storeName?: string }) {
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('choose');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ connected: boolean }>('/api/support/status')
      .then((res) => setAiConfigured(res.connected))
      .catch(() => setAiConfigured(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy, open, view]);

  const waHref = waLink(number ?? '');
  const waLabel = `Chat with ${storeName ?? 'Arif Gadgets'} on WhatsApp`;

  function openWhatsApp() {
    trackContact('whatsapp_float');
    window.open(waHref, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  function toggle() {
    if (!open) {
      setOpen(true);
      // Reopen straight into an already-started conversation; otherwise ask.
      setView(turns.length > 0 ? 'ai' : 'choose');
    } else {
      setOpen(false);
    }
  }

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
      if (!res.ok) setError(res.error || 'Could not get a reply.');
      else setTurns((prev) => [...prev, { role: 'model', text: res.reply }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach support chat.');
    } finally {
      setBusy(false);
    }
  }

  // No AI chat configured — the plain WhatsApp button this used to be,
  // nothing more to merge.
  if (aiConfigured === false) {
    return (
      <a className="chat-fab" href={waHref} onClick={() => trackContact('whatsapp_float')} target="_blank" rel="noopener noreferrer" aria-label={waLabel} title={waLabel}>
        <WhatsAppIcon />
        <span className="chat-fab-text">Chat with us</span>
      </a>
    );
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Chat"
          className="chat-panel"
          style={{
            position: 'fixed',
            right: 18,
            bottom: 84,
            width: 'min(360px, calc(100vw - 36px))',
            height: view === 'choose' ? 'auto' : 'min(520px, calc(100vh - 160px))',
            zIndex: 95,
          }}
        >
          {view === 'choose' ? (
            <>
              <div className="chat-panel-head">
                <div>
                  <strong style={{ fontSize: '0.95rem' }}>👋 Hi there!</strong>
                  <div className="tiny dim">যেভাবে সাহায্য চান, বেছে নিন</div>
                </div>
                <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="chat-choice-grid">
                <button type="button" className="chat-choice-card wa" onClick={openWhatsApp}>
                  <span className="chat-choice-icon">
                    <WhatsAppIcon size={26} />
                  </span>
                  <span className="chat-choice-label">WhatsApp</span>
                  <span className="chat-choice-hint">সরাসরি কথা বলুন</span>
                </button>
                {aiConfigured && (
                  <button type="button" className="chat-choice-card ai" onClick={() => setView('ai')}>
                    <span className="chat-choice-icon" aria-hidden="true">
                      🤖
                    </span>
                    <span className="chat-choice-label">AI সহায়তা</span>
                    <span className="chat-choice-hint">তাৎক্ষণিক উত্তর</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="chat-panel-head">
                <button type="button" className="icon-btn" aria-label="Back" onClick={() => setView('choose')}>
                  ←
                </button>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '0.9rem' }}>🤖 AI সহায়তা</strong>
                  <div className="tiny dim">Delivery, payment, returns — instant answers</div>
                </div>
                <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
                  ✕
                </button>
              </div>

              <div ref={scrollRef} className="chat-panel-body">
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
                  <div key={i} className={`chat-bubble ${t.role === 'user' ? 'user' : 'model'}`}>
                    {t.text}
                  </div>
                ))}
                {busy && (
                  <div className="tiny dim" style={{ alignSelf: 'flex-start' }}>
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
                className="chat-panel-input"
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
            </>
          )}
        </div>
      )}

      <button
        type="button"
        className="chat-fab"
        aria-expanded={open}
        aria-label={open ? 'Close chat' : 'Open chat'}
        onClick={toggle}
      >
        <span aria-hidden="true" style={{ fontSize: '1.35rem', lineHeight: 1 }}>
          {open ? '✕' : '💬'}
        </span>
        <span className="chat-fab-text">Chat with us</span>
      </button>
    </>
  );
}
