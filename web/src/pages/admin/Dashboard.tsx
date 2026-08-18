import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { dayLabel, money, moneyShort, number, percent, relativeTime, orderStatus } from '../../lib/format';
import type { CategoryStat, InventoryAlert, Overview, SeriesPoint, StockMovement, TopProduct } from '../../lib/types';
import { BarChart, BarList, Legend, LineChart } from '../../components/charts';
import { Empty, Spinner, Stat } from '../../components/ui';

const RANGES = [7, 30, 90];
type Metric = 'money' | 'orders' | 'units';

const PIPELINE_ORDER = ['pending', 'confirmed', 'shipped', 'delivered', 'refunded', 'cancelled'];

/** What Steadfast reports back, summarised by the Worker. */
interface CourierSummary {
  booked: number;
  delivered: number;
  returned: number;
  in_transit: number;
  awaiting_approval: number;
  success_rate: number;
  return_rate: number;
  cod_collected: number;
  cod_outstanding: number;
}

export function Dashboard() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<Metric>('money');

  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  /**
   * Courier figures are fetched on their own rather than alongside the rest.
   * Steadfast being unreachable, or simply not connected, must not blank out
   * the sales dashboard.
   */
  const [courier, setCourier] = useState<CourierSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      api<Overview>(`/api/admin/analytics/overview?days=${days}`, { auth: true }),
      api<{ series: SeriesPoint[] }>(`/api/admin/analytics/timeseries?days=${days}`, { auth: true }),
      api<{ products: TopProduct[] }>(`/api/admin/analytics/top-products?days=${days}&limit=8`, { auth: true }),
      api<{ categories: CategoryStat[] }>(`/api/admin/analytics/categories?days=${days}`, { auth: true }),
      api<{ alerts: InventoryAlert[]; recent_movements: StockMovement[] }>(
        `/api/admin/analytics/inventory?days=${days}`,
        { auth: true },
      ),
    ])
      .then(([ov, ts, tp, cats, inv]) => {
        if (cancelled) return;
        setOverview(ov);
        setSeries(ts.series);
        setTop(tp.products);
        setCategories(cats.categories);
        setAlerts(inv.alerts);
        setMovements(inv.recent_movements);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    api<CourierSummary>(`/api/admin/analytics/courier?days=${days}`, { auth: true })
      .then((res) => !cancelled && setCourier(res))
      .catch(() => !cancelled && setCourier(null));
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading && !overview) return <Spinner />;
  if (error) return <Empty icon="⚠️" title="Could not load analytics" hint={error} />;
  if (!overview) return null;

  const { sales, change, inventory, catalogue, pipeline } = overview;
  const labels = series.map((point) => dayLabel(point.day));

  const moneySeries = [
    { key: 'revenue', label: 'Revenue', color: 'var(--series-1)', values: series.map((p) => p.revenue) },
    { key: 'profit', label: 'Profit', color: 'var(--series-2)', values: series.map((p) => p.profit) },
  ];

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Overview</span>
          <h1>Store performance</h1>
          <p className="small muted">
            Everything below is derived live from the order and stock ledgers — last {days} days.
          </p>
        </div>
        <div className="pill-tabs">
          {RANGES.map((range) => (
            <button key={range} className={days === range ? 'active' : ''} onClick={() => setDays(range)}>
              {range}d
            </button>
          ))}
        </div>
      </div>

      <div className="stat-row">
        <Stat
          label="Revenue"
          value={money(sales.revenue)}
          delta={change.revenue}
          foot={`vs ${money(overview.previous.revenue)}`}
        />
        <Stat
          label="Gross profit"
          value={money(sales.profit)}
          delta={change.profit}
          foot={`${percent(sales.margin_pct)} margin`}
        />
        <Stat label="Orders" value={number(sales.orders)} delta={change.orders} foot={`${number(sales.units)} units`} />
        <Stat label="Avg order value" value={money(sales.aov)} delta={change.aov} foot={`${number(sales.customers)} customers`} />
      </div>

      <div className="stat-row">
        <Stat label="Stock on hand" value={number(inventory.stock_units)} foot={`${money(inventory.stock_cost_value)} at cost`} />
        <Stat
          label="Unrealised profit"
          value={money(inventory.unrealised_profit)}
          foot={`if all stock sells at list`}
        />
        <Stat
          label="Needs restocking"
          value={number(inventory.low_stock + inventory.out_of_stock)}
          foot={`${inventory.out_of_stock} out · ${inventory.low_stock} low`}
        />
        <Stat
          label="Catalogue"
          value={number(catalogue.active)}
          foot={`${catalogue.updated_in_period} updated · ${catalogue.draft} draft`}
        />
      </div>

      <div className="chart-grid split">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>
                {metric === 'money' ? 'Revenue and profit' : metric === 'orders' ? 'Orders per day' : 'Units sold per day'}
              </h3>
              <p className="tiny dim">Confirmed orders only — pending and cancelled are excluded.</p>
            </div>
            <div className="pill-tabs">
              <button className={metric === 'money' ? 'active' : ''} onClick={() => setMetric('money')}>
                Money
              </button>
              <button className={metric === 'orders' ? 'active' : ''} onClick={() => setMetric('orders')}>
                Orders
              </button>
              <button className={metric === 'units' ? 'active' : ''} onClick={() => setMetric('units')}>
                Units
              </button>
            </div>
          </div>
          <div className="panel-body">
            {metric === 'money' ? (
              <>
                <Legend series={moneySeries} />
                <LineChart labels={labels} series={moneySeries} format={moneyShort} formatFull={money} />
              </>
            ) : (
              <BarChart
                labels={labels}
                values={series.map((p) => (metric === 'orders' ? p.orders : p.units))}
                color="var(--series-3)"
                label={metric === 'orders' ? 'Orders' : 'Units'}
                format={(v) => number(Math.round(v))}
              />
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Order pipeline</h3>
          </div>
          <div className="panel-body">
            <BarList
              items={PIPELINE_ORDER.filter((status) => pipeline[status]).map((status) => ({
                id: status,
                label: orderStatus(status),
                value: pipeline[status].count,
                sub: money(pipeline[status].value),
              }))}
              format={(v) => number(v)}
              color="var(--series-3)"
            />
            {Object.keys(pipeline).length === 0 && <Empty icon="🧾" title="No orders yet" />}
          </div>
        </div>
      </div>

      {courier && courier.booked > 0 && (
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-head">
            <div>
              <h3>Courier — Steadfast</h3>
              <p className="tiny dim">
                {number(courier.booked)} parcel{courier.booked === 1 ? '' : 's'} booked in the last {days} days
                {courier.awaiting_approval > 0
                  ? ` · ${number(courier.awaiting_approval)} awaiting courier approval`
                  : ''}
              </p>
            </div>
            <Link to="/admin/orders" className="btn ghost sm">
              All orders
            </Link>
          </div>
          <div className="panel-body">
            <div className="stat-row">
              <Stat label="Delivered" value={number(courier.delivered)} foot={`${percent(courier.success_rate)} success`} />
              <Stat label="Returned" value={number(courier.returned)} foot={`${percent(courier.return_rate)} of settled`} />
              <Stat label="Still moving" value={number(courier.in_transit)} foot="With the courier now" />
              <Stat label="COD collected" value={money(courier.cod_collected)} foot="Cash the courier owes you" />
              <Stat label="COD outstanding" value={money(courier.cod_outstanding)} foot="Not delivered yet" />
            </div>
            <p className="tiny dim" style={{ marginTop: 10 }}>
              Success and return rates count only parcels the courier has finished with, so today's deliveries still on
              the road do not drag the figure down.
            </p>
          </div>
        </div>
      )}

      <div className="chart-grid split">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Top products by revenue</h3>
              <p className="tiny dim">Last {days} days</p>
            </div>
            <Link to="/admin/products" className="btn ghost sm">
              All products
            </Link>
          </div>
          <div className="panel-body">
            <BarList
              items={top.map((product) => ({
                id: product.id,
                label: product.name,
                value: product.revenue,
                sub: `${number(product.units)} units · ${money(product.profit)} profit`,
              }))}
              format={money}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Revenue by category</h3>
          </div>
          <div className="panel-body">
            <BarList
              items={categories
                .filter((category) => category.revenue > 0)
                .map((category) => ({
                  id: category.id,
                  label: `${category.icon} ${category.name}`,
                  value: category.revenue,
                  sub: `${number(category.units)} units`,
                }))}
              format={money}
              color="var(--series-2)"
            />
            {categories.every((c) => c.revenue === 0) && <Empty icon="📊" title="No category sales yet" />}
          </div>
        </div>
      </div>

      <div className="chart-grid split">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Restock queue</h3>
              <p className="tiny dim">Out of stock first, then anything at or below its threshold.</p>
            </div>
            <Link to="/admin/inventory" className="btn ghost sm">
              Manage
            </Link>
          </div>
          <div className="table-scroll">
            {alerts.length === 0 ? (
              <Empty icon="✅" title="Everything is well stocked" />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Stock</th>
                    <th className="num">Tied up</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.slice(0, 8).map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <div style={{ fontWeight: 600 }} className="truncate">
                          {alert.name}
                        </div>
                        <span className="tiny dim">{alert.sku}</span>
                      </td>
                      <td className="num">
                        <span className={`badge ${alert.stock_state === 'out' ? 'out' : 'low'}`}>
                          {alert.stock}
                        </span>
                      </td>
                      <td className="num">{money(alert.tied_up)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Recent stock movements</h3>
          </div>
          <div className="table-scroll" style={{ maxHeight: 380, overflowY: 'auto' }}>
            {movements.length === 0 ? (
              <Empty icon="📋" title="No movements recorded" />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Change</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.slice(0, 14).map((movement) => (
                    <tr key={movement.id}>
                      <td>
                        <div className="truncate" style={{ maxWidth: 200, fontWeight: 600 }}>
                          {movement.name}
                        </div>
                        <span className="tiny dim">{movement.reason}</span>
                      </td>
                      <td className="num">
                        <strong style={{ color: movement.delta > 0 ? 'var(--good)' : 'var(--bad)' }}>
                          {movement.delta > 0 ? '+' : ''}
                          {movement.delta}
                        </strong>
                        <div className="tiny dim">→ {movement.balance_after}</div>
                      </td>
                      <td className="tiny dim">{relativeTime(movement.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
