import { useRef, useState } from 'react';

/**
 * Hand-rolled SVG charts — no charting dependency.
 *
 * Rules held to throughout: one y-axis per chart (never dual), 2px lines,
 * recessive grid, a legend whenever two series are drawn plus direct end
 * labels, and a crosshair tooltip on hover. Series colours come from
 * --series-N, which are validated against both the light and dark surfaces.
 */

const W = 820;
const H = 280;
const PAD = { top: 18, right: 74, bottom: 30, left: 62 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Round an axis maximum up to a clean 1/2/5 × 10ⁿ step. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  labels: string[];
  series: Series[];
  format: (value: number) => string;
  /** Full-precision formatter for the tooltip; defaults to `format`. */
  formatFull?: (value: number) => string;
  height?: number;
}

export function LineChart({ labels, series, format, formatFull, height = H }: LineChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const count = labels.length;
  if (count === 0 || series.length === 0) {
    return <p className="empty small">No data for this period yet.</p>;
  }

  const rawMax = Math.max(1, ...series.flatMap((s) => s.values));
  const max = niceMax(rawMax);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  const x = (index: number) => PAD.left + (count === 1 ? PLOT_W / 2 : (index / (count - 1)) * PLOT_W);
  const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H;

  const labelEvery = Math.max(1, Math.ceil(count / 7));
  const showTooltip = formatFull ?? format;

  function pick(clientX: number) {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const ratio = (svgX - PAD.left) / PLOT_W;
    const index = Math.round(ratio * (count - 1));
    setHover(index >= 0 && index < count ? index : null);
  }

  return (
    <div
      className="chart-shell"
      ref={hostRef}
      onMouseMove={(e) => pick(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchMove={(e) => e.touches[0] && pick(e.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${series.map((s) => s.label).join(' and ')} over time`}>
        {/* grid + y axis */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth="1" />
            <text
              x={PAD.left - 10}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--ink-3)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {format(tick)}
            </text>
          </g>
        ))}

        {/* x axis labels */}
        {labels.map((label, index) =>
          index % labelEvery === 0 || index === count - 1 ? (
            <text key={label} x={x(index)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
              {label}
            </text>
          ) : null,
        )}

        {/* crosshair sits under the marks */}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="var(--ink-3)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {series.map((s) => {
          const path = s.values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`).join(' ');
          const area = `${path} L${x(count - 1)},${y(0)} L${x(0)},${y(0)} Z`;
          return (
            <g key={s.key}>
              <path d={area} fill={s.color} opacity="0.09" />
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {/* hovered points get a surface ring so overlapping marks stay separable */}
        {hover !== null &&
          series.map((s) => (
            <circle
              key={s.key}
              cx={x(hover)}
              cy={y(s.values[hover])}
              r="4.5"
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth="2"
            />
          ))}

        {/* direct end labels — identity never rests on colour alone */}
        {series.map((s) => {
          const last = s.values[count - 1];
          return (
            <text
              key={s.key}
              x={W - PAD.right + 9}
              y={y(last) + 4}
              fontSize="11.5"
              fontWeight="700"
              fill={s.color}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {format(last)}
            </text>
          );
        })}
      </svg>

      {hover !== null && (
        <div
          className="chart-tip"
          style={{
            left: `${((x(hover) / W) * 100).toFixed(2)}%`,
            top: `${((PAD.top / H) * 100).toFixed(2)}%`,
          }}
        >
          <div className="t">{labels[hover]}</div>
          {series.map((s) => (
            <div className="r" key={s.key}>
              <span>
                <span className="sw" style={{ background: s.color }} />
                {s.label}
              </span>
              <strong>{showTooltip(s.values[hover])}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface BarChartProps {
  labels: string[];
  values: number[];
  color: string;
  label: string;
  format: (value: number) => string;
}

/** Single-series column chart. One series, so no legend — the panel title names it. */
export function BarChart({ labels, values, color, label, format }: BarChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const count = values.length;
  if (count === 0) return <p className="empty small">No data for this period yet.</p>;

  const max = niceMax(Math.max(1, ...values));
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const slot = PLOT_W / count;
  const barW = Math.max(3, Math.min(30, slot - 2)); // 2px surface gap between bars
  const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H;
  const labelEvery = Math.max(1, Math.ceil(count / 7));

  return (
    <div className="chart-shell" ref={hostRef} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} per day`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth="1" />
            <text x={PAD.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">
              {format(tick)}
            </text>
          </g>
        ))}

        {values.map((value, index) => {
          const cx = PAD.left + slot * index + slot / 2;
          const top = y(value);
          const height = Math.max(value > 0 ? 2 : 0, PAD.top + PLOT_H - top);
          return (
            <g key={index} onMouseEnter={() => setHover(index)}>
              {/* invisible full-height hit target, bigger than the mark */}
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={PLOT_H} fill="transparent" />
              <rect
                x={cx - barW / 2}
                y={top}
                width={barW}
                height={height}
                rx="4"
                fill={color}
                opacity={hover === null || hover === index ? 1 : 0.45}
              />
            </g>
          );
        })}

        {labels.map((text, index) =>
          index % labelEvery === 0 || index === count - 1 ? (
            <text
              key={text}
              x={PAD.left + slot * index + slot / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--ink-3)"
            >
              {text}
            </text>
          ) : null,
        )}
      </svg>

      {hover !== null && (
        <div
          className="chart-tip"
          style={{
            left: `${(((PAD.left + slot * hover + slot / 2) / W) * 100).toFixed(2)}%`,
            top: `${((PAD.top / H) * 100).toFixed(2)}%`,
          }}
        >
          <div className="t">{labels[hover]}</div>
          <div className="r">
            <span>
              <span className="sw" style={{ background: color }} />
              {label}
            </span>
            <strong>{format(values[hover])}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export interface BarListItem {
  id: string | number;
  label: string;
  value: number;
  sub?: string;
}

/** Horizontal magnitude ranking with a direct value label on every row. */
export function BarList({
  items,
  format,
  color = 'var(--series-1)',
}: {
  items: BarListItem[];
  format: (value: number) => string;
  color?: string;
}) {
  if (items.length === 0) return <p className="empty small">Nothing to rank yet.</p>;
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="bar-row">
      {items.map((item) => (
        <div className="bar-item" key={item.id}>
          <span className="nm" title={item.label}>
            {item.label}
            {item.sub && <span className="dim tiny"> · {item.sub}</span>}
          </span>
          <span className="vl">{format(item.value)}</span>
          <div className="track">
            <div className="fill" style={{ width: `${Math.max((item.value / max) * 100, 1.5)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Legend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="chart-legend">
      {series.map((s) => (
        <span key={s.label}>
          <span className="sw" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
