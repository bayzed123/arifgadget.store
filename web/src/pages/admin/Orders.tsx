import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import {
  COURIER_TONE,
  courierStatus,
  dateTime,
  money,
  number,
  orderStatus,
  ORDER_STATUS_TONE,
  percent,
} from '../../lib/format';
import { useToast } from '../../lib/store';
import type { AdminOrder, CourierConnection, OrderItem } from '../../lib/types';
import { Empty, Spinner } from '../../components/ui';
import { CourierBanner } from '../../components/CourierBanner';

const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'refunded', 'cancelled'];

/**
 * The next checkpoint on the happy path. The Worker enforces the same map, so
 * a stale tab cannot push an order somewhere the pipeline does not allow.
 */
const NEXT: Record<string, string | null> = {
  pending: 'confirmed',
  confirmed: 'shipped',
  shipped: 'delivered',
  delivered: null,
  refunded: null,
  cancelled: null,
};

/** Checkpoints that end an order and send its stock back. */
const CLOSED = ['refunded', 'cancelled'];

interface Page {
  orders: AdminOrder[];
  page: number;
  pages: number;
  total: number;
}

export function Orders() {
  const toast = useToast();
  const [data, setData] = useState<Page | null>(null);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openId, setOpenId] = useState<number | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [saving, setSaving] = useState<number | null>(null);

  /** Courier connection state, so staff see why it is not working, not just that. */
  const [courier, setCourier] = useState<CourierConnection | null>(null);
  const [courierBusy, setCourierBusy] = useState<number | 'all' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page), limit: '40' });
    if (q.trim()) params.set('q', q.trim());

    api<Page>(`/api/admin/orders?${params}`, { auth: true })
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, q, page]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 260 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  // Asked once per visit. Reads the courier account balance, which proves both
  // keys without booking anything, so it costs the shop nothing.
  useEffect(() => {
    api<CourierConnection>('/api/admin/courier', { auth: true })
      .then(setCourier)
      .catch(() =>
        setCourier({
          connected: false,
          balance: null,
          reason: 'unreachable',
          message: 'The dashboard could not reach its own API to ask about the courier.',
          fix: 'Reload the page. If it keeps happening the Worker may be down — check its /health address.',
          credentials: {
            api_key_present: false,
            secret_key_present: false,
            api_key_length: 0,
            secret_key_length: 0,
            base_url: '',
          },
        }),
      );
  }, []);

  /** Hands one parcel to Steadfast. Real money, so always confirmed first. */
  async function book(order: AdminOrder) {
    const cod = order.payment_method === 'cod' ? order.total : 0;
    const line = cod > 0 ? `collect ${money(cod)} on delivery` : 'collect nothing — this order is already paid';
    if (!confirm(`Send ${order.order_no} to Steadfast and ${line}?`)) return;

    setCourierBusy(order.id);
    try {
      const res = await api<{ tracking_code: string; consignment_id: string }>(
        `/api/admin/orders/${order.id}/courier`,
        { method: 'POST', auth: true },
      );
      toast(`${order.order_no} booked — tracking ${res.tracking_code || res.consignment_id}`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Steadfast would not accept this order', 'error');
    } finally {
      setCourierBusy(null);
    }
  }

  /** Refreshes one parcel, or every parcel still in flight. */
  async function refresh(order?: AdminOrder) {
    setCourierBusy(order ? order.id : 'all');
    try {
      if (order) {
        const res = await api<{ courier_status_label: string; moved_to?: string }>(
          `/api/admin/orders/${order.id}/courier/sync`,
          { method: 'POST', auth: true },
        );
        toast(
          `${order.order_no}: ${res.courier_status_label}${res.moved_to ? ` — moved to ${orderStatus(res.moved_to)}` : ''}`,
          'success',
        );
      } else {
        const res = await api<{ checked: number; moved: number; failed: number }>('/api/admin/courier/sync', {
          method: 'POST',
          auth: true,
        });
        toast(
          `Checked ${res.checked} parcel${res.checked === 1 ? '' : 's'} · ${res.moved} moved` +
            (res.failed ? ` · ${res.failed} could not be read` : ''),
          res.failed ? 'error' : 'success',
        );
      }
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not reach Steadfast', 'error');
    } finally {
      setCourierBusy(null);
    }
  }

  async function openOrder(order: AdminOrder) {
    if (openId === order.id) {
      setOpenId(null);
      return;
    }
    setOpenId(order.id);
    setItems([]);
    try {
      const res = await api<{ items: OrderItem[] }>(`/api/admin/orders/${order.id}`, { auth: true });
      setItems(res.items);
    } catch {
      setItems([]);
    }
  }

  async function move(order: AdminOrder, next: string) {
    if (
      CLOSED.includes(next) &&
      !confirm(
        `Mark ${order.order_no} as ${orderStatus(next).toLowerCase()}? Every unit goes back into stock ` +
          'automatically, and the order drops out of revenue. This cannot be undone.',
      )
    ) {
      return;
    }

    setSaving(order.id);
    try {
      await api(`/api/admin/orders/${order.id}`, { method: 'PATCH', auth: true, body: { status: next } });
      toast(`${order.order_no} → ${orderStatus(next)}`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update the order', 'error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Fulfilment</span>
          <h1>Orders</h1>
          <p className="small muted">
            {data ? `${number(data.total)} orders` : 'Loading…'} · cancelling or refunding restocks automatically
          </p>
        </div>
      </div>

      <CourierBanner
        state={courier}
        action={
          courier?.connected ? (
            <button className="btn ghost sm" disabled={courierBusy !== null} onClick={() => refresh()}>
              {courierBusy === 'all' ? 'Checking…' : 'Refresh courier'}
            </button>
          ) : null
        }
      />

      <div className="filter-bar">
        <input
          className="input"
          placeholder="Search order no, invoice no, name or phone…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          style={{ flex: 1, minWidth: 220 }}
        />
        <div className="pill-tabs">
          <button className={status === 'all' ? 'active' : ''} onClick={() => { setStatus('all'); setPage(1); }}>
            All
          </button>
          {STATUSES.map((option) => (
            <button
              key={option}
              className={status === option ? 'active' : ''}
              onClick={() => {
                setStatus(option);
                setPage(1);
              }}
            >
              {orderStatus(option)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && !data && <Spinner />}

      {data && (
        <div className="panel">
          <div className="table-scroll">
            {data.orders.length === 0 ? (
              <Empty icon="🧾" title="No orders here yet" />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th className="num">Units</th>
                    <th className="num">Total</th>
                    <th className="num">Profit</th>
                    <th>Status</th>
                    <th>Courier</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <Fragment key={order.id}>
                      <tr>
                        <td>
                          <button
                            className="mono"
                            style={{ background: 'none', border: 0, cursor: 'pointer', fontWeight: 700, padding: 0 }}
                            onClick={() => openOrder(order)}
                          >
                            {openId === order.id ? '▾' : '▸'} {order.order_no}
                          </button>
                          {/* The number printed on the customer's receipt. */}
                          {order.invoice_no && <div className="tiny dim mono">{order.invoice_no}</div>}
                          <div className="tiny dim">{dateTime(order.created_at)}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{order.customer_name}</div>
                          <span className="tiny dim">
                            {order.customer_phone} · {order.city}
                          </span>
                        </td>
                        <td className="num">{number(order.units)}</td>
                        <td className="num">
                          <strong>{money(order.total)}</strong>
                          <div className="tiny dim">
                            {order.payment_method.toUpperCase()}
                            {order.payment_reference ? ` · ${order.payment_reference}` : ''}
                          </div>
                        </td>
                        <td className="num">
                          <strong style={{ color: order.profit >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                            {money(order.profit)}
                          </strong>
                          <div className="tiny dim">{percent(order.margin_pct)}</div>
                        </td>
                        <td>
                          <span className={`badge ${ORDER_STATUS_TONE[order.status] ?? 'info'}`}>
                            <span className="dot" /> {orderStatus(order.status)}
                          </span>
                        </td>
                        <td>
                          {order.consignment_id ? (
                            <>
                              <span className={`badge ${COURIER_TONE[order.courier_status ?? ''] ?? 'info'}`}>
                                <span className="dot" /> {courierStatus(order.courier_status ?? 'pending')}
                              </span>
                              <div className="tiny dim mono">{order.tracking_code || order.consignment_id}</div>
                              {(order.courier_cod_amount ?? 0) > 0 && (
                                <div className="tiny dim">COD {money(order.courier_cod_amount ?? 0)}</div>
                              )}
                            </>
                          ) : (
                            <span className="tiny dim">Not sent</span>
                          )}
                        </td>
                        <td>
                          <div className="row gap-4 wrap-row">
                            {courier?.connected && !order.consignment_id && !CLOSED.includes(order.status) && (
                              <button
                                className="btn ghost sm"
                                disabled={courierBusy !== null}
                                onClick={() => book(order)}
                              >
                                {courierBusy === order.id ? 'Sending…' : 'Send to Steadfast'}
                              </button>
                            )}
                            {courier?.connected && order.consignment_id && (
                              <button
                                className="btn ghost sm"
                                disabled={courierBusy !== null}
                                onClick={() => refresh(order)}
                              >
                                {courierBusy === order.id ? 'Checking…' : 'Refresh'}
                              </button>
                            )}
                            {NEXT[order.status] && (
                              <button
                                className="btn primary sm"
                                disabled={saving === order.id}
                                onClick={() => move(order, NEXT[order.status]!)}
                              >
                                Mark {orderStatus(NEXT[order.status]!).toLowerCase()}
                              </button>
                            )}
                            {['pending', 'confirmed'].includes(order.status) && (
                              <button
                                className="btn danger sm"
                                disabled={saving === order.id}
                                onClick={() => move(order, 'cancelled')}
                              >
                                Cancel
                              </button>
                            )}
                            {['shipped', 'delivered'].includes(order.status) && (
                              <button
                                className="btn ghost sm"
                                disabled={saving === order.id}
                                onClick={() => move(order, 'refunded')}
                              >
                                Returned
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {openId === order.id && (
                        <tr>
                          <td colSpan={8} style={{ background: 'var(--surface-inset)' }}>
                            {items.length === 0 ? (
                              <p className="small dim">Loading line items…</p>
                            ) : (
                              <div className="row gap-32 wrap-row" style={{ alignItems: 'flex-start' }}>
                                <table className="data" style={{ flex: 1, minWidth: 320, background: 'var(--surface)' }}>
                                  <thead>
                                    <tr>
                                      <th>Item</th>
                                      <th className="num">Qty</th>
                                      <th className="num">Unit</th>
                                      <th className="num">Cost</th>
                                      <th className="num">Line profit</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((item) => (
                                      <tr key={item.id}>
                                        <td>
                                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                                          <span className="tiny dim mono">{item.sku}</span>
                                        </td>
                                        <td className="num">{item.qty}</td>
                                        <td className="num">{money(item.unit_price)}</td>
                                        <td className="num dim">{money(item.unit_cost)}</td>
                                        <td className="num" style={{ color: 'var(--good)', fontWeight: 700 }}>
                                          {money(item.line_profit)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>

                                <div style={{ minWidth: 220 }}>
                                  <div className="summary-row">
                                    <span className="muted">Subtotal</span>
                                    <span className="v">{money(order.subtotal)}</span>
                                  </div>
                                  {order.discount > 0 && (
                                    <div className="summary-row save">
                                      <span className="muted">Discount</span>
                                      <span className="v">− {money(order.discount)}</span>
                                    </div>
                                  )}
                                  <div className="summary-row">
                                    <span className="muted">Delivery</span>
                                    <span className="v">{money(order.shipping)}</span>
                                  </div>
                                  <div className="summary-row">
                                    <span className="muted">Cost of goods</span>
                                    <span className="v dim">{money(order.cost_total)}</span>
                                  </div>
                                  <div className="summary-row total">
                                    <span>Total</span>
                                    <span className="v">{money(order.total)}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {data.pages > 1 && (
            <div className="panel-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, justifyContent: 'center' }}>
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Previous
              </button>
              <span className="small muted num">
                Page {data.page} of {data.pages}
              </span>
              <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
