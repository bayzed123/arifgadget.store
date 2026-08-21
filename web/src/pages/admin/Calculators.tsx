import { useState } from 'react';
import { money } from '../../lib/format';
import { Stat } from '../../components/ui';
import { useSeo } from '../../lib/seo';

/**
 * Business math staff would otherwise reach for a phone calculator or a
 * spreadsheet for — ad campaign cost checks, a quick ROI sanity check on a
 * promotion, quoting a customer an EMI plan, working out a markdown
 * percentage. Everything here recomputes live as you type; nothing is saved
 * or sent anywhere, so there is nothing to load, submit, or clean up.
 *
 * BMI/BMR were on the original list but left out on purpose: they measure a
 * person's body, not the business, and have no connection to anything this
 * dashboard otherwise does. Ad, revenue, financing and pricing math earn
 * their place here; body metrics would just be clutter.
 */

function toNum(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = 'any',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  step?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className="hint">{suffix}</span>}
    </div>
  );
}

function CpmPanel() {
  const [spend, setSpend] = useState('');
  const [impressions, setImpressions] = useState('');
  const [targetCpm, setTargetCpm] = useState('');
  const [wantImpressions, setWantImpressions] = useState('');

  const cpm = toNum(impressions) > 0 ? (toNum(spend) / toNum(impressions)) * 1000 : 0;
  const budgetNeeded = (toNum(targetCpm) * toNum(wantImpressions)) / 1000;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>CPM calculator</h3>
          <p className="tiny dim">Cost per 1,000 impressions — check a Facebook/Google ad bill, or plan one.</p>
        </div>
      </div>
      <div className="panel-body stack gap-16">
        <div>
          <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
            Find the CPM
          </span>
          <div className="form-grid">
            <NumField label="Ad spend" value={spend} onChange={setSpend} suffix="৳ total spent on the campaign" />
            <NumField label="Impressions" value={impressions} onChange={setImpressions} suffix="times the ad was shown" />
          </div>
          <div className="stat-row" style={{ marginTop: 12 }}>
            <Stat label="CPM" value={cpm > 0 ? money(cpm * 100, { decimals: true }) : '—'} foot="per 1,000 impressions" />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
            Find the budget needed
          </span>
          <div className="form-grid">
            <NumField label="Target CPM" value={targetCpm} onChange={setTargetCpm} suffix="৳ per 1,000 impressions" />
            <NumField label="Impressions wanted" value={wantImpressions} onChange={setWantImpressions} />
          </div>
          <div className="stat-row" style={{ marginTop: 12 }}>
            <Stat label="Budget needed" value={budgetNeeded > 0 ? money(budgetNeeded * 100, { decimals: true }) : '—'} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RoiPanel() {
  const [cost, setCost] = useState('');
  const [revenue, setRevenue] = useState('');

  const c = toNum(cost);
  const r = toNum(revenue);
  const profit = r - c;
  const roi = c > 0 ? (profit / c) * 100 : 0;
  const hasInput = c > 0 || r > 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>ROI calculator</h3>
          <p className="tiny dim">Return on investment for a promotion, a stock buy-in, or a boosted post.</p>
        </div>
      </div>
      <div className="panel-body stack gap-16">
        <div className="form-grid">
          <NumField label="Cost / investment" value={cost} onChange={setCost} suffix="৳ spent" />
          <NumField label="Revenue / return" value={revenue} onChange={setRevenue} suffix="৳ earned back" />
        </div>
        <div className="stat-row">
          <Stat
            label="Net profit"
            value={hasInput ? money(profit * 100, { decimals: true }) : '—'}
            foot={hasInput && profit < 0 ? 'a loss at this cost/return' : undefined}
          />
          <Stat
            label="ROI"
            value={c > 0 ? `${roi >= 0 ? '' : '−'}${Math.abs(roi).toFixed(1)}%` : '—'}
            foot={c > 0 ? (roi >= 0 ? 'profitable' : 'below break-even') : 'enter a cost to compute ROI'}
          />
        </div>
      </div>
    </div>
  );
}

function EmiPanel() {
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [months, setMonths] = useState('');

  const p = toNum(principal);
  const n = toNum(months);
  const annualRate = toNum(rate);
  const monthlyRate = annualRate / 12 / 100;

  let emi = 0;
  if (p > 0 && n > 0) {
    emi = monthlyRate > 0 ? (p * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1) : p / n;
  }
  const totalPayment = emi * n;
  const totalInterest = totalPayment - p;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>EMI calculator</h3>
          <p className="tiny dim">Quote a customer a monthly instalment plan on a phone or a bulk order.</p>
        </div>
      </div>
      <div className="panel-body stack gap-16">
        <div className="form-grid">
          <NumField label="Loan amount" value={principal} onChange={setPrincipal} suffix="৳ financed" />
          <NumField label="Annual interest rate" value={rate} onChange={setRate} suffix="% per year — 0 for interest-free" />
          <NumField label="Tenure" value={months} onChange={setMonths} suffix="months" step="1" />
        </div>
        <div className="stat-row">
          <Stat label="Monthly EMI" value={emi > 0 ? money(emi * 100, { decimals: true }) : '—'} />
          <Stat label="Total payment" value={totalPayment > 0 ? money(totalPayment * 100, { decimals: true }) : '—'} />
          <Stat
            label="Total interest"
            value={totalPayment > 0 ? money(Math.max(totalInterest, 0) * 100, { decimals: true }) : '—'}
          />
        </div>
      </div>
    </div>
  );
}

type PctMode = 'of' | 'isWhatPct' | 'change';

function PercentagePanel() {
  const [mode, setMode] = useState<PctMode>('of');
  const [x, setX] = useState('');
  const [y, setY] = useState('');

  const nx = toNum(x);
  const ny = toNum(y);

  let result: number | null = null;
  let label = '';
  let xLabel = '';
  let yLabel = '';

  if (mode === 'of') {
    xLabel = 'Percentage';
    yLabel = 'Of this number';
    result = ny !== 0 || nx !== 0 ? (nx / 100) * ny : null;
    label = `${nx || 0}% of ${ny || 0}`;
  } else if (mode === 'isWhatPct') {
    xLabel = 'This number';
    yLabel = 'Is what % of this';
    result = ny > 0 ? (nx / ny) * 100 : null;
    label = `${nx || 0} as a % of ${ny || 0}`;
  } else {
    xLabel = 'From';
    yLabel = 'To';
    result = nx > 0 ? ((ny - nx) / nx) * 100 : null;
    label = `Change from ${nx || 0} to ${ny || 0}`;
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Percentage calculator</h3>
          <p className="tiny dim">Discounts, markups, and how much a number moved.</p>
        </div>
        <div className="pill-tabs">
          <button className={mode === 'of' ? 'active' : ''} onClick={() => setMode('of')}>
            X% of Y
          </button>
          <button className={mode === 'isWhatPct' ? 'active' : ''} onClick={() => setMode('isWhatPct')}>
            X is what % of Y
          </button>
          <button className={mode === 'change' ? 'active' : ''} onClick={() => setMode('change')}>
            % change
          </button>
        </div>
      </div>
      <div className="panel-body stack gap-16">
        <div className="form-grid">
          <NumField label={xLabel} value={x} onChange={setX} />
          <NumField label={yLabel} value={y} onChange={setY} />
        </div>
        <div className="stat-row">
          <Stat
            label="Result"
            value={
              result === null
                ? '—'
                : mode === 'of'
                  ? result.toLocaleString('en-US', { maximumFractionDigits: 2 })
                  : `${result >= 0 ? '' : '−'}${Math.abs(result).toFixed(2)}%`
            }
            foot={label}
          />
        </div>
      </div>
    </div>
  );
}

export function Calculators() {
  useSeo({ title: 'Calculators', noindex: true });

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Tools</span>
          <h1>Calculators</h1>
          <p className="small muted">Quick business math — nothing here is saved, everything recomputes as you type.</p>
        </div>
      </div>

      <div className="chart-grid split">
        <CpmPanel />
        <RoiPanel />
      </div>
      <div className="chart-grid split">
        <EmiPanel />
        <PercentagePanel />
      </div>
    </>
  );
}
