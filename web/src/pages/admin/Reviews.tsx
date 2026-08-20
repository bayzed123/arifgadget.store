import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { date } from '../../lib/format';
import { useToast } from '../../lib/store';
import { Empty, Spinner } from '../../components/ui';

/**
 * Staff cannot write a rating — see reviews.ts on the Worker side — only
 * hide one. That is enforced there; this page is just the moderation view
 * for it: read what buyers actually said, and hide anything that shouldn't
 * be public (abuse, a personal detail typed into the comment, a rating that
 * is clearly about the courier rather than the product). Hiding keeps the
 * row rather than deleting it, so the decision is reversible and shows up in
 * the audit log either way.
 */

interface ReviewRow {
  id: number;
  rating: number;
  comment: string;
  customer_name: string;
  customer_phone: string;
  visible: number;
  created_at: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  order_no: string | null;
}

interface Totals {
  total: number;
  average: number;
  hidden: number;
}

export function Reviews() {
  const toast = useToast();
  const [tab, setTab] = useState<'visible' | 'hidden'>('visible');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load(which: 'visible' | 'hidden') {
    setLoading(true);
    try {
      const res = await api<{ reviews: ReviewRow[]; totals: Totals }>(
        `/api/admin/reviews?hidden=${which === 'hidden' ? 1 : 0}`,
        { auth: true },
      );
      setRows(res.reviews);
      setTotals(res.totals);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load ratings', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function toggle(row: ReviewRow) {
    setBusyId(row.id);
    try {
      await api(`/api/admin/reviews/${row.id}`, { method: 'PATCH', auth: true, body: { visible: row.visible ? 0 : 1 } });
      toast(row.visible ? 'Rating hidden' : 'Rating shown again', 'success');
      await load(tab);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update this rating', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Storefront</span>
          <h1>Customer ratings</h1>
          <p className="small muted">
            {totals
              ? `${totals.total} rating${totals.total === 1 ? '' : 's'} overall, average ${totals.average.toFixed(1)}★` +
                (totals.hidden ? `, ${totals.hidden} hidden` : '') +
                '.'
              : 'Only buyers with a delivered order can leave one — see reviews.ts for the rules.'}
          </p>
        </div>
      </div>

      <div className="row gap-8" style={{ marginBottom: 16 }}>
        <button className={`btn ${tab === 'visible' ? 'primary' : 'ghost'} sm`} onClick={() => setTab('visible')}>
          Visible
        </button>
        <button className={`btn ${tab === 'hidden' ? 'primary' : 'ghost'} sm`} onClick={() => setTab('hidden')}>
          Hidden{totals?.hidden ? ` (${totals.hidden})` : ''}
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon="⭐" title={tab === 'visible' ? 'No ratings yet' : 'Nothing hidden'} />
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Rating</th>
                <th>Comment</th>
                <th>Customer</th>
                <th>Order</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/product/${r.product_slug}`} target="_blank" rel="noreferrer">
                      {r.product_name}
                    </Link>
                  </td>
                  <td className="mono" style={{ color: 'var(--gold)' }}>
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)}
                  </td>
                  <td className="small truncate" style={{ maxWidth: 280 }}>
                    {r.comment || <span className="dim">—</span>}
                  </td>
                  <td className="small">
                    {r.customer_name}
                    <div className="tiny dim">{r.customer_phone}</div>
                  </td>
                  <td className="mono tiny">{r.order_no ?? '—'}</td>
                  <td className="tiny dim">{date(r.created_at)}</td>
                  <td>
                    <button
                      className={`btn ${r.visible ? 'danger' : 'ghost'} sm`}
                      disabled={busyId === r.id}
                      onClick={() => void toggle(r)}
                    >
                      {busyId === r.id ? '…' : r.visible ? 'Hide' : 'Show'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
