import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { dateTime, money, number, orderStatus, ORDER_STATUS_TONE, relativeTime } from '../../lib/format';
import { Empty, Spinner } from '../../components/ui';

interface CustomerRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  created_at: number;
  last_login_at: number | null;
  orders: number;
  spent: number;
  last_order_at: number | null;
}

interface CustomerOrder {
  id: number;
  order_no: string;
  status: string;
  total: number;
  units: number;
  payment_method: string;
  city: string;
  created_at: number;
}

interface Page {
  customers: CustomerRow[];
  page: number;
  pages: number;
  total: number;
}

/**
 * Registered shoppers. Guests who ordered without an account are not here —
 * they live in Orders, which lists every order however it was placed.
 */
export function Customers() {
  const [data, setData] = useState<Page | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openId, setOpenId] = useState<number | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (q.trim()) params.set('q', q.trim());

    api<Page>(`/api/admin/customers?${params}`, { auth: true })
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, page]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 260 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  async function toggle(customer: CustomerRow) {
    if (openId === customer.id) {
      setOpenId(null);
      return;
    }
    setOpenId(customer.id);
    setOrders(null);
    try {
      const res = await api<{ orders: CustomerOrder[] }>(`/api/admin/customers/${customer.id}`, { auth: true });
      setOrders(res.orders);
    } catch {
      setOrders([]);
    }
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">
            People · <span className="bn">গ্রাহক</span>
          </span>
          <h1>Customers</h1>
          <p className="small muted">
            {data ? `${number(data.total)} registered accounts` : 'Loading…'} · click a row to see every order that
            account has placed
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="input"
          placeholder="Search name, mobile number, email or city…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          style={{ flex: 1, minWidth: 220 }}
        />
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && !data && <Spinner />}

      {data && (
        <div className="panel">
          <div className="table-scroll">
            {data.customers.length === 0 ? (
              <Empty
                icon="👥"
                title={q ? 'No customer matches that search' : 'No one has registered yet'}
                hint={
                  q
                    ? 'Try just the last few digits of the mobile number.'
                    : 'Shoppers can order as guests too — those orders appear under Orders.'
                }
              />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Delivery address</th>
                    <th className="num">Orders</th>
                    <th className="num">Spent</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((customer) => (
                    <Fragment key={customer.id}>
                      <tr>
                        <td>
                          <button
                            style={{ background: 'none', border: 0, cursor: 'pointer', fontWeight: 700, padding: 0, textAlign: 'left' }}
                            onClick={() => toggle(customer)}
                          >
                            {openId === customer.id ? '▾' : '▸'} {customer.name}
                          </button>
                          <div className="tiny dim">
                            {customer.last_login_at
                              ? `Last signed in ${relativeTime(customer.last_login_at)}`
                              : 'Never signed in since registering'}
                          </div>
                        </td>
                        <td>
                          <a href={`tel:${customer.phone}`} style={{ fontWeight: 600 }}>
                            {customer.phone}
                          </a>
                          <div className="tiny dim">
                            {customer.email ? (
                              <a href={`mailto:${customer.email}`}>{customer.email}</a>
                            ) : (
                              'no email given'
                            )}
                          </div>
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          {customer.address ? (
                            <>
                              <div className="small">{customer.address}</div>
                              {customer.city && <div className="tiny dim">{customer.city}</div>}
                            </>
                          ) : (
                            <span className="tiny dim">not saved yet</span>
                          )}
                        </td>
                        <td className="num">
                          <strong>{number(customer.orders)}</strong>
                          {customer.last_order_at && (
                            <div className="tiny dim">last {relativeTime(customer.last_order_at)}</div>
                          )}
                        </td>
                        <td className="num">
                          <strong>{money(customer.spent)}</strong>
                          <div className="tiny dim">confirmed only</div>
                        </td>
                        <td>
                          <span className="small">{dateTime(customer.created_at)}</span>
                        </td>
                      </tr>

                      {openId === customer.id && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--surface-inset)' }}>
                            {!orders ? (
                              <Spinner />
                            ) : orders.length === 0 ? (
                              <p className="small muted" style={{ padding: '8px 2px' }}>
                                This account has not ordered yet.
                              </p>
                            ) : (
                              <table className="data">
                                <thead>
                                  <tr>
                                    <th>Order</th>
                                    <th className="num">Units</th>
                                    <th className="num">Total</th>
                                    <th>Payment</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {orders.map((order) => (
                                    <tr key={order.id}>
                                      <td>
                                        <span className="mono" style={{ fontWeight: 700 }}>
                                          {order.order_no}
                                        </span>
                                        <div className="tiny dim">{dateTime(order.created_at)}</div>
                                      </td>
                                      <td className="num">{number(order.units)}</td>
                                      <td className="num">
                                        <strong>{money(order.total)}</strong>
                                      </td>
                                      <td>{order.payment_method.toUpperCase()}</td>
                                      <td>
                                        <span className={`badge ${ORDER_STATUS_TONE[order.status] ?? 'info'}`}>
                                          <span className="dot" /> {orderStatus(order.status)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
            <div className="panel-body between">
              <span className="small muted">
                Page {data.page} of {data.pages}
              </span>
              <div className="row gap-8">
                <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
