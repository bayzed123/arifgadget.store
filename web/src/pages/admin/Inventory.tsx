import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { money, number, relativeTime } from '../../lib/format';
import type { AdminProduct, InventoryAlert, Overview, StockMovement } from '../../lib/types';
import { Empty, Spinner, Stat } from '../../components/ui';
import { StockDialog } from './StockDialog';

interface DeadStock {
  id: number;
  sku: string;
  name: string;
  stock: number;
  tied_up: number;
  updated_at: number;
}

export function Inventory() {
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [dead, setDead] = useState<DeadStock[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restocking, setRestocking] = useState<AdminProduct | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api<{ alerts: InventoryAlert[]; dead_stock: DeadStock[]; recent_movements: StockMovement[] }>(
        '/api/admin/analytics/inventory?days=30',
        { auth: true },
      ),
      api<Overview>('/api/admin/analytics/overview?days=30', { auth: true }),
    ])
      .then(([inv, ov]) => {
        setAlerts(inv.alerts);
        setDead(inv.dead_stock);
        setMovements(inv.recent_movements);
        setOverview(ov);
        setError('');
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  /** The alerts feed carries enough of a product for the stock dialog. */
  async function openRestock(alert: InventoryAlert) {
    const res = await api<{ product: AdminProduct }>(`/api/admin/products/${alert.id}`, { auth: true });
    setRestocking(res.product);
  }

  if (loading && !overview) return <Spinner />;
  if (error) return <Empty icon="⚠️" title="Could not load inventory" hint={error} />;

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Warehouse</span>
          <h1>Inventory</h1>
          <p className="small muted">Every number here traces back to an entry in the stock ledger.</p>
        </div>
      </div>

      {overview && (
        <div className="stat-row">
          <Stat label="Units on hand" value={number(overview.inventory.stock_units)} />
          <Stat label="Capital tied up" value={money(overview.inventory.stock_cost_value)} foot="at cost price" />
          <Stat label="Retail value" value={money(overview.inventory.stock_retail_value)} foot="at list price" />
          <Stat
            label="Unrealised profit"
            value={money(overview.inventory.unrealised_profit)}
            foot="if everything sells"
          />
        </div>
      )}

      <div className="chart-grid split">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Restock queue</h3>
              <p className="tiny dim">Out of stock first, then anything at or below its low-stock threshold.</p>
            </div>
            <span className="badge low">{alerts.length} to review</span>
          </div>
          <div className="table-scroll">
            {alerts.length === 0 ? (
              <Empty icon="✅" title="Nothing needs restocking" hint="Every active product is above its threshold." />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Stock</th>
                    <th className="num">Threshold</th>
                    <th className="num">Reorder cost</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{alert.name}</div>
                        <span className="tiny dim mono">{alert.sku}</span>
                      </td>
                      <td className="num">
                        <span className={`badge ${alert.stock_state === 'out' ? 'out' : 'low'}`}>{alert.stock}</span>
                      </td>
                      <td className="num dim">{alert.low_stock_threshold}</td>
                      <td className="num">
                        {money(Math.max(alert.low_stock_threshold * 2 - alert.stock, 0) * alert.cost_price)}
                        <div className="tiny dim">to reach 2× threshold</div>
                      </td>
                      <td>
                        <button className="btn primary sm" onClick={() => openRestock(alert)}>
                          Restock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Dead stock</h3>
              <p className="tiny dim">In stock but sold nothing in 30 days.</p>
            </div>
          </div>
          <div className="table-scroll">
            {dead.length === 0 ? (
              <Empty icon="🎉" title="Everything is moving" />
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
                  {dead.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="truncate" style={{ fontWeight: 600, maxWidth: 220 }}>
                          {item.name}
                        </div>
                        <span className="tiny dim mono">{item.sku}</span>
                      </td>
                      <td className="num">{number(item.stock)}</td>
                      <td className="num" style={{ color: 'var(--warn)', fontWeight: 700 }}>
                        {money(item.tied_up)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Stock ledger</h3>
          <p className="tiny dim">Append-only. Sales, restocks, damage and cancellations all land here.</p>
        </div>
        <div className="table-scroll">
          {movements.length === 0 ? (
            <Empty icon="📋" title="No movements yet" />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Reason</th>
                  <th className="num">Change</th>
                  <th className="num">Balance after</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>
                      <div style={{ fontWeight: 600 }} className="truncate">
                        {movement.name}
                      </div>
                      <span className="tiny dim mono">{movement.sku}</span>
                    </td>
                    <td>
                      <span className="badge info">{movement.reason}</span>
                      {movement.note && <div className="tiny dim">{movement.note}</div>}
                    </td>
                    <td className="num">
                      <strong style={{ color: movement.delta > 0 ? 'var(--good)' : 'var(--bad)' }}>
                        {movement.delta > 0 ? '+' : ''}
                        {number(movement.delta)}
                      </strong>
                    </td>
                    <td className="num">{number(movement.balance_after)}</td>
                    <td className="small dim">{movement.actor}</td>
                    <td className="tiny dim">{relativeTime(movement.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {restocking && (
        <StockDialog
          product={restocking}
          onClose={() => setRestocking(null)}
          onSaved={() => {
            setRestocking(null);
            load();
          }}
        />
      )}
    </>
  );
}
