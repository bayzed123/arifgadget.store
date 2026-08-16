import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { dateTime, money, number, ORDER_STATUS_TONE } from '../lib/format';
import { useCustomer, useToast } from '../lib/store';
import type { PressItem } from '../lib/types';
import { Empty, Spinner } from '../components/ui';

interface MyOrder {
  order_no: string;
  status: string;
  total: number;
  units: number;
  city: string;
  payment_method: string;
  created_at: number;
}

interface Banner {
  id: number;
  title: string;
  subtitle: string;
  link_url: string;
  cta_label: string;
}

/** Sign-in / register, shown when there is no customer session. */
function AuthPanel() {
  const { signIn, register } = useCustomer();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', phone: '', password: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await register({ name: form.name, phone: form.phone, password: form.password, email: form.email });
        toast('Account created', 'success');
      } else {
        await signIn(form.phone, form.password);
        toast('Signed in', 'success');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 460, margin: '0 auto' }}>
      <div className="panel-body stack gap-24" style={{ padding: 28 }}>
        <div className="center">
          <h1 style={{ fontSize: '1.4rem' }}>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
          <p className="small muted">
            {mode === 'login'
              ? 'Track your orders and see offers first.'
              : 'One account for your orders, addresses and offers.'}
          </p>
        </div>

        <form className="stack gap-16" onSubmit={submit}>
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="a-name">Your name</label>
              <input id="a-name" className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
            </div>
          )}

          <div className="field">
            <label htmlFor="a-phone">Mobile number</label>
            <input
              id="a-phone"
              className="input"
              required
              placeholder="01XXXXXXXXX"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              autoComplete="tel"
              inputMode="numeric"
            />
            <span className="hint">This is your username — the same number you order with.</span>
          </div>

          {mode === 'register' && (
            <div className="field">
              <label htmlFor="a-email">Email (optional)</label>
              <input id="a-email" type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
            </div>
          )}

          <div className="field">
            <label htmlFor="a-pass">Password</label>
            <input
              id="a-pass"
              type="password"
              className="input"
              required
              minLength={mode === 'register' ? 6 : 1}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
            {mode === 'register' && <span className="hint">At least 6 characters.</span>}
          </div>

          {error && <div className="alert error">{error}</div>}

          <button className="btn primary lg block" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="center small">
          <button
            className="btn ghost sm"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </div>

        <p className="tiny dim center">
          You can also order without an account, and{' '}
          <Link to="/track" style={{ textDecoration: 'underline' }}>
            track it with your order number
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

/** Signed-in view: profile, offers and order history. */
function Dashboard() {
  const { customer, signOut, refresh } = useCustomer();
  const toast = useToast();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [offers, setOffers] = useState<Banner[]>([]);
  const [press, setPress] = useState<PressItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    city: customer?.city ?? '',
  });

  useEffect(() => {
    api<{ orders: MyOrder[] }>('/api/account/orders', { customerAuth: true })
      .then((res) => setOrders(res.orders))
      .catch(() => setOrders([]));
    api<{ banners: Banner[] }>('/api/banners')
      .then((res) => setOffers(res.banners))
      .catch(() => setOffers([]));
    api<{ press: PressItem[] }>('/api/press')
      .then((res) => setPress(res.press.slice(0, 2)))
      .catch(() => setPress([]));
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/api/account/me', { method: 'PATCH', customerAuth: true, body: form });
      toast('Details saved', 'success');
      setEditing(false);
      refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save', 'error');
    }
  }

  return (
    <>
      <div className="section-head">
        <div>
          <div className="rule" />
          <h1>Hello, {customer?.name}</h1>
          <p className="small muted">{customer?.phone}</p>
        </div>
        <button className="btn ghost sm" onClick={signOut}>
          Sign out
        </button>
      </div>

      {offers.length > 0 && (
        <div className="offer-strip" style={{ marginBottom: 20 }}>
          {offers.map((offer) => (
            <div className="offer-chip" key={offer.id}>
              <span className="ic" aria-hidden="true">
                🎁
              </span>
              <div>
                <strong>{offer.title}</strong>
                {offer.subtitle && <div className="tiny">{offer.subtitle}</div>}
              </div>
              {offer.link_url && (
                <Link className="btn primary sm" to={offer.link_url}>
                  {offer.cta_label || 'View'}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="cart-layout">
        <div className="panel">
          <div className="panel-head">
            <h3>Your orders</h3>
            <Link to="/catalog" className="btn ghost sm">
              Shop again
            </Link>
          </div>
          <div className="table-scroll">
            {!orders ? (
              <Spinner />
            ) : orders.length === 0 ? (
              <Empty icon="🧾" title="No orders yet" hint="Orders you place while signed in appear here." />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th className="num">Units</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.order_no}>
                      <td>
                        <Link to={`/track?order=${order.order_no}`} className="mono" style={{ fontWeight: 700 }}>
                          {order.order_no}
                        </Link>
                        <div className="tiny dim">{dateTime(order.created_at)}</div>
                      </td>
                      <td className="num">{number(order.units)}</td>
                      <td className="num">
                        <strong>{money(order.total)}</strong>
                        <div className="tiny dim">{order.payment_method.toUpperCase()}</div>
                      </td>
                      <td>
                        <span className={`badge ${ORDER_STATUS_TONE[order.status] ?? 'info'}`}>
                          <span className="dot" /> {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="stack gap-16">
          <div className="panel">
            <div className="panel-head">
              <h3>Your details</h3>
              {!editing && (
                <button className="btn ghost sm" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
            </div>
            <div className="panel-body">
              {editing ? (
                <form className="stack gap-12" onSubmit={saveProfile}>
                  <div className="field">
                    <label htmlFor="p-name">Name</label>
                    <input id="p-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="p-email">Email</label>
                    <input id="p-email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="p-addr">Delivery address</label>
                    <textarea id="p-addr" className="textarea" style={{ minHeight: 70 }} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="p-city">City</label>
                    <input id="p-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div className="row gap-8">
                    <button className="btn primary sm" type="submit">
                      Save
                    </button>
                    <button className="btn ghost sm" type="button" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </div>
                  <p className="tiny dim">Saved details are filled in automatically at checkout.</p>
                </form>
              ) : (
                <div className="contact-list">
                  <span className="row-i">
                    <span className="ic">👤</span>
                    <span>{customer?.name}</span>
                  </span>
                  <span className="row-i">
                    <span className="ic">📞</span>
                    <span>{customer?.phone}</span>
                  </span>
                  {customer?.email && (
                    <span className="row-i">
                      <span className="ic">✉️</span>
                      <span>{customer.email}</span>
                    </span>
                  )}
                  {customer?.address && (
                    <span className="row-i">
                      <span className="ic">📍</span>
                      <span>
                        {customer.address}
                        {customer.city ? `, ${customer.city}` : ''}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {press.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h3 style={{ fontSize: '0.95rem' }}>In the news</h3>
              </div>
              <div className="panel-body stack gap-8">
                {press.map((item) => (
                  <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="small">
                    {item.title}
                    <span aria-hidden="true"> ↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

export function Account() {
  const { customer, ready } = useCustomer();
  if (!ready) return <Spinner />;
  return customer ? <Dashboard /> : <AuthPanel />;
}
