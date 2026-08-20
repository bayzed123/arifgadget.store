import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { dateTime, money, number, orderStatus } from '../lib/format';
import type { StoreSettings } from '../lib/types';
import { Spinner } from '../components/ui';
import { Logo } from '../components/Logo';
import { useSeo } from '../lib/seo';

interface InvoiceOrder {
  order_no: string;
  invoice_no?: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  city: string;
  note: string;
  status: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  payment_method: string;
  payment_reference: string;
  delivery_zone: string;
  created_at: number;
}

interface InvoiceItem {
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  /** Which colour was ordered, for products stocked in several. */
  colour?: string;
}

/**
 * A printable receipt the customer keeps as proof. Deliberately plain: it is
 * printed and saved as PDF through the browser rather than generated
 * server-side, which keeps the Worker free of a PDF library and works on every
 * phone without a download the sandbox might block.
 */
export function Invoice() {
  useSeo({ title: 'Invoice', noindex: true });
  const { orderNo = '' } = useParams();
  const [params] = useSearchParams();
  const phone = params.get('phone') ?? '';

  const [data, setData] = useState<{ order: InvoiceOrder; items: InvoiceItem[] } | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderNo || !phone) {
      setError('This invoice link needs both the order number and the phone number used on the order.');
      return;
    }
    api<{ order: InvoiceOrder; items: InvoiceItem[] }>(
      `/api/orders/${encodeURIComponent(orderNo)}?phone=${encodeURIComponent(phone)}`,
    )
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this invoice'));

    api<StoreSettings>('/api/settings').then(setSettings).catch(() => setSettings(null));
  }, [orderNo, phone]);

  if (error) {
    return (
      <div className="panel" style={{ maxWidth: 560, margin: '30px auto' }}>
        <div className="panel-body center stack gap-16" style={{ padding: 32 }}>
          <div style={{ fontSize: '2.4rem' }} aria-hidden="true">
            🧾
          </div>
          <h1 style={{ fontSize: '1.3rem' }}>Invoice unavailable</h1>
          <p className="small muted">{error}</p>
          <Link to="/track" className="btn primary">
            Find my order
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return <Spinner />;

  const { order, items } = data;
  const zoneLabel = order.delivery_zone === 'dhaka' ? 'Inside Dhaka' : 'Outside Dhaka';

  return (
    <div className="invoice-wrap">
      <div className="invoice-actions">
        <button className="btn primary" onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </button>
        <Link to={`/track?order=${order.order_no}`} className="btn ghost">
          Track this order
        </Link>
      </div>

      <article className="invoice">
        <header className="invoice-head">
          <div>
            <div className="invoice-brand" aria-hidden="true">
              <Logo />
            </div>
            {/*
              The registered name, not the short brand on the logo. A receipt is
              a document someone may present for a warranty claim or an expense
              return, so it states who the shop legally is.
            */}
            <h1>{settings?.legal_name || settings?.store_name || 'ARIF GADGET STORE'}</h1>
            {settings?.store_address && <p className="small">{settings.store_address}</p>}
            <p className="small">
              {settings?.support_phone}
              {settings?.support_phone_2 ? ` · ${settings.support_phone_2}` : ''}
            </p>
            {settings?.support_email && <p className="small">{settings.support_email}</p>}
            {settings?.support_whatsapp_url && (
              <p className="small">
                WhatsApp:{' '}
                <a href={settings.support_whatsapp_url} target="_blank" rel="noopener noreferrer">
                  {settings.support_whatsapp_url.replace('https://wa.me/', '+')}
                </a>
              </p>
            )}
          </div>
          <div className="right">
            {/*
              Two identifiers, each labelled. This block used to head "Invoice"
              with the order number, so one string was doing both jobs and there
              was no invoice reference to quote or search on.
            */}
            <div className="eyebrow">Invoice no.</div>
            <div className="mono invoice-no">{order.invoice_no ?? order.order_no}</div>
            <p className="small">
              Order no. <span className="mono">{order.order_no}</span>
            </p>
            <p className="small">{dateTime(order.created_at)}</p>
            <p className="small">
              Status: <strong>{orderStatus(order.status)}</strong>
            </p>
          </div>
        </header>

        <section className="invoice-parties">
          <div>
            <div className="eyebrow">Billed to</div>
            <p>
              <strong>{order.customer_name}</strong>
            </p>
            <p className="small">{order.customer_phone}</p>
            <p className="small">
              {order.address}
              {order.city ? `, ${order.city}` : ''}
            </p>
          </div>
          <div>
            <div className="eyebrow">Payment</div>
            <p>
              <strong>{order.payment_method.toUpperCase()}</strong>
            </p>
            {order.payment_reference && <p className="small mono">TrxID {order.payment_reference}</p>}
            <p className="small">Delivery area: {zoneLabel}</p>
          </div>
        </section>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              {/*
                This column was headed "Unit" while showing money, so it read as
                a second, contradictory price next to Amount. It is the price of
                one piece — the header now says so.
              */}
              <th className="num">Unit price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sku}>
                <td>
                  {item.name}
                  <div className="tiny dim">
                    SKU {item.sku}
                    {item.colour ? ` · Colour: ${item.colour}` : ''}
                  </div>
                </td>
                <td className="num">
                  {number(item.qty)} <span className="tiny dim">pcs</span>
                </td>
                <td className="num">{money(item.unit_price)}</td>
                <td className="num">{money(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="between">
            <span>Subtotal</span>
            <span className="num">{money(order.subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="between">
              <span>Discount</span>
              <span className="num">− {money(order.discount)}</span>
            </div>
          )}
          <div className="between">
            <span>Delivery · {zoneLabel}</span>
            <span className="num">{order.shipping === 0 ? 'Free' : money(order.shipping)}</span>
          </div>
          {order.tax > 0 && (
            <div className="between">
              <span>Tax</span>
              <span className="num">{money(order.tax)}</span>
            </div>
          )}
          <div className="between grand">
            <span>Total</span>
            <span className="num">{money(order.total)}</span>
          </div>
        </div>

        {order.note && (
          <p className="small" style={{ marginTop: 18 }}>
            <strong>Note:</strong> {order.note}
          </p>
        )}

        <footer className="invoice-foot">
          <p className="small">
            Thank you for your order. Keep this invoice as proof of purchase — quote{' '}
            <strong className="mono">{order.order_no}</strong> with your phone number for any support or
            return request within seven days.
          </p>
          {settings?.owner_name && <p className="tiny dim">{settings.owner_name} · {settings?.store_name}</p>}
        </footer>
      </article>
    </div>
  );
}
