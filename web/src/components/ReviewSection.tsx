import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { date } from '../lib/format';
import { useCustomer, useToast } from '../lib/store';
import { Empty, Spinner } from './ui';

/**
 * Real buyers rating what they bought — the Worker side of this
 * (worker/src/routes/reviews.ts) already enforces every rule that matters: a
 * rating is only accepted from a phone number with a *delivered* order
 * containing the product, and only once per order. This component is just
 * the shopfront for that — show what other buyers said, and let an eligible
 * one add their own, without ever pretending the rules are enforced here too.
 *
 * No customer account is required to rate — the same order-number-plus-phone
 * pair that unlocks order tracking (see Track.tsx) unlocks this.
 */

interface ReviewRow {
  id: number;
  name: string;
  rating: number;
  comment: string;
  created_at: number;
}

interface Summary {
  count: number;
  average: number;
  stars: Record<string, number>;
}

/** Static stars for one review or the aggregate. */
function StarRow({ rating, size = '1rem' }: { rating: number; size?: string }) {
  const full = Math.round(rating);
  return (
    <span aria-hidden="true" style={{ color: 'var(--gold)', letterSpacing: '1px', fontSize: size }}>
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
    </span>
  );
}

/** Interactive 1–5 star picker — click or keyboard, with a hover preview. */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label="Your rating" className="row gap-4">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.7rem',
            lineHeight: 1,
            padding: 2,
            color: n <= shown ? 'var(--gold)' : 'var(--line)',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function ReviewSection({ slug, productName }: { slug: string; productName: string }) {
  const { customer } = useCustomer();
  const toast = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [stage, setStage] = useState<'identify' | 'rate' | 'done'>('identify');
  const [orderNo, setOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const [checking, setChecking] = useState(false);
  const [ineligibleReason, setIneligibleReason] = useState('');
  const [eligibleName, setEligibleName] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Prefills a signed-in shopper's number; never their order — that stays
  // product-specific and unknown until they type it.
  useEffect(() => {
    if (customer?.phone) setPhone((prev) => prev || customer.phone);
  }, [customer]);

  async function load() {
    try {
      const res = await api<{ summary: Summary; reviews: ReviewRow[] }>(`/api/products/${slug}/reviews`);
      setSummary(res.summary);
      setItems(res.reviews);
    } catch {
      // The aggregate star badge at the top of the page already came from the
      // product record itself — losing this list is not worth an error banner.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function resetForm() {
    setShowForm(false);
    setStage('identify');
    setOrderNo('');
    setIneligibleReason('');
    setRating(0);
    setComment('');
  }

  async function checkEligibility(event: FormEvent) {
    event.preventDefault();
    if (!orderNo.trim() || !phone.trim()) return;
    setChecking(true);
    setIneligibleReason('');
    try {
      const res = await api<{ can_rate: boolean; reason?: string; name?: string }>(
        `/api/products/${slug}/reviews/eligibility?order=${encodeURIComponent(orderNo.trim())}&phone=${encodeURIComponent(phone.trim())}`,
      );
      if (res.can_rate) {
        setEligibleName(res.name ?? '');
        setStage('rate');
      } else {
        setIneligibleReason(res.reason ?? 'This order is not eligible to rate this product.');
      }
    } catch (err) {
      setIneligibleReason(err instanceof ApiError ? err.message : 'Could not check that right now. Try again.');
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    if (rating < 1) {
      toast('Choose a star rating first', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api(`/api/products/${slug}/reviews`, {
        method: 'POST',
        body: { order_no: orderNo.trim(), phone: phone.trim(), rating, comment: comment.trim() },
      });
      setStage('done');
      toast('Thanks — your rating is posted', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not post your rating', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={{ marginTop: 48 }} id="reviews">
      <div className="section-head">
        <div>
          <div className="rule" />
          <h2>Customer ratings</h2>
        </div>
        {!showForm && (
          <button className="btn ghost" onClick={() => setShowForm(true)}>
            Rate this product
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : summary && summary.count > 0 ? (
        <div className="review-summary">
          <div className="review-avg">
            <strong style={{ fontSize: '2rem', display: 'block', lineHeight: 1 }}>{summary.average.toFixed(1)}</strong>
            <StarRow rating={summary.average} />
            <span className="tiny dim" style={{ display: 'block', marginTop: 4 }}>
              {summary.count} rating{summary.count === 1 ? '' : 's'}
            </span>
          </div>
          <div className="review-bars">
            {[5, 4, 3, 2, 1].map((n) => {
              const starCount = summary.stars[String(n)] ?? 0;
              const pct = summary.count ? Math.round((starCount / summary.count) * 100) : 0;
              return (
                <div key={n} className="review-bar-row">
                  <span className="tiny dim">{n}★</span>
                  <div className="review-bar">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <span className="tiny dim">{starCount}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        !showForm && <Empty icon="⭐" title="No ratings yet" hint="Be the first buyer to rate this product." />
      )}

      {showForm && (
        <div className="panel" style={{ marginTop: 16, maxWidth: 460 }}>
          <div className="panel-body stack gap-14">
            {stage === 'identify' && (
              <form className="stack gap-12" onSubmit={checkEligibility}>
                <p className="small muted">
                  Only buyers with a delivered order of this product can rate it — enter the details from your order
                  confirmation.
                </p>
                <div className="field">
                  <label htmlFor="rv-order">Order number</label>
                  <input
                    id="rv-order"
                    className="input"
                    placeholder="e.g. AGMT0DG3MRX2"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="rv-phone">Mobile number</label>
                  <input
                    id="rv-phone"
                    className="input"
                    type="tel"
                    placeholder="01XXXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                {ineligibleReason && <div className="alert warn small">{ineligibleReason}</div>}
                <div className="row gap-8 wrap-row">
                  <button className="btn primary" type="submit" disabled={checking || !orderNo.trim() || !phone.trim()}>
                    {checking ? 'Checking…' : 'Continue'}
                  </button>
                  <button className="btn ghost" type="button" onClick={resetForm}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {stage === 'rate' && (
              <div className="stack gap-12">
                <p className="small">
                  {eligibleName ? `Hi ${eligibleName.split(' ')[0]}, how` : 'How'} was <strong>{productName}</strong>?
                </p>
                <StarPicker value={rating} onChange={setRating} />
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Share your experience (optional)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 600))}
                />
                <div className="row gap-8 wrap-row">
                  <button className="btn primary" disabled={submitting || rating < 1} onClick={() => void submit()}>
                    {submitting ? 'Posting…' : 'Post rating'}
                  </button>
                  <button className="btn ghost" onClick={resetForm} disabled={submitting}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {stage === 'done' && (
              <div className="stack gap-8">
                <p className="small">
                  <strong>Thanks for rating {productName}!</strong> Your review is now live below.
                </p>
                <button className="btn ghost sm" onClick={resetForm}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul className="review-list">
          {items.map((r) => (
            <li key={r.id} className="review-item">
              <div className="between">
                <strong>{r.name}</strong>
                <span className="tiny dim">{date(r.created_at)}</span>
              </div>
              <StarRow rating={r.rating} size="0.85rem" />
              {r.comment && <p className="small" style={{ marginTop: 6 }}>{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
