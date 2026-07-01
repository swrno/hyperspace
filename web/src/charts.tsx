import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared premium SVG chart primitives — no chart deps.
 *
 * On-brand warm palette, smooth animated lines, an interactive donut and
 * horizontal bars. Used by both the Dashboard and per-KB Insights so the two
 * surfaces look identical and evolve the same way as their data re-polls.
 */

export const PALETTE = ['#C9A66B', '#8AA9C9', '#C28379', '#8FAE97', '#9C93B0', '#8FB0AE', '#D8B48C', '#B58FA8'];

/* ── Skeleton (shimmer placeholder) ───────────────────────────────────── */
export const Skeleton = ({ className = '', style }: { className?: string; style?: CSSProperties }) => (
  <div className={`bg-gradient-to-r from-[#2A2826] via-[#34322F] to-[#2A2826] animate-shimmer ${className}`} style={style} />
);

/* ── Geometry helpers ─────────────────────────────────────────────────── */
export function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(560);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ── Sparkline (stat cards) ───────────────────────────────────────────── */
// A gentle, premium trend curve. Uses the real series once there's enough
// history; before that it draws a tasteful rising curve (or a soft centred
// wave when the value is still 0) instead of a flat 2-point "ruler".
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 104, h = 34, p = 5;
  const clean = data.filter((v) => Number.isFinite(v));
  const last = clean.length ? clean[clean.length - 1] : 0;
  const distinct = new Set(clean).size;
  let norm: number[];
  if (clean.length >= 4 && distinct >= 3) {
    const mx = Math.max(...clean), mn = Math.min(...clean);
    norm = clean.map((v) => (v - mn) / Math.max(mx - mn, 1));
  } else if (last > 0) {
    norm = [0.08, 0.17, 0.13, 0.28, 0.36, 0.32, 0.51, 0.64, 0.86];
  } else {
    norm = [0.46, 0.43, 0.47, 0.42, 0.46, 0.43, 0.47, 0.44, 0.46];
  }
  const faded = last === 0;
  const n = norm.length;
  const pts = norm.map((v, i) => ({ x: p + (i / Math.max(n - 1, 1)) * (w - p * 2), y: h - p - v * (h - p * 2) }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[n - 1].x} ${h - p} L ${pts[0].x} ${h - p} Z`;
  const gid = `spk-${color.replace('#', '')}-${faded ? 'f' : 'u'}`;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={faded ? 0.12 : 0.3} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="chart-area" d={area} fill={`url(#${gid})`} />
      <path className="chart-line" pathLength={1} d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={faded ? 0.5 : 1} />
      <circle cx={pts[n - 1].x} cy={pts[n - 1].y} r={2.6} fill={color} opacity={faded ? 0.5 : 1} />
    </svg>
  );
}

/* ── Stat card (icon · sparkline · big number) ────────────────────────── */
export function StatCard({ label, value, sub, color, Icon, spark, onClick }: {
  label: string; value: number | string; sub?: string; color: string;
  Icon: LucideIcon; spark: number[]; onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.12] blur-2xl" style={{ background: color }} />
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '1f', border: `1px solid ${color}40` }}>
          <Icon size={17} style={{ color }} strokeWidth={1.85} />
        </span>
        <Sparkline data={spark} color={color} />
      </div>
      <div>
        <p className="text-[26px] font-geist font-semibold text-[#F4F0EB] tabular-nums leading-none">{value}</p>
        <p className="text-[11.5px] font-geist text-[#8C8880] mt-1.5 flex items-center gap-1">
          {label}{sub ? <span className="text-[#6B6762]">· {sub}</span> : null}
        </p>
      </div>
    </>
  );
  const cls = 'card-elev rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden text-left w-full';
  return onClick
    ? <button onClick={onClick} className={`${cls} card-elev-hover`}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

/* ── Smooth area line chart (multi-series + hover) ────────────────────── */
export interface Series { name: string; color: string; values: number[] }
export function AreaChart({ labels, series, height = 230 }: { labels: string[]; series: Series[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const padL = 34, padR = 16, padT = 16, padB = 26;
  const innerW = Math.max(w - padL - padR, 10), innerH = height - padT - padB;
  const n = labels.length;
  const maxY = Math.max(1, ...series.flatMap((s) => s.values));
  const niceMax = Math.ceil(maxY / 4) * 4 || 4;
  const xAt = (i: number) => padL + (i / Math.max(n - 1, 1)) * innerW;
  const yAt = (v: number) => padT + innerH - (v / niceMax) * innerH;

  const move = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = Math.round(((x - padL) / innerW) * (n - 1));
    setHi(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height} className="block" onMouseMove={move} onMouseLeave={() => setHi(null)}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.name} id={`area-${s.name}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.34" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {/* gridlines */}
        {[0, 1, 2, 3, 4].map((g) => {
          const v = (niceMax / 4) * g, y = yAt(v);
          return (
            <g key={g}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#33302E" strokeWidth={1} />
              <text x={padL - 8} y={y + 3} textAnchor="end" className="fill-[#6B6762]" style={{ fontSize: 9.5, fontFamily: 'Geist, sans-serif' }}>{Math.round(v)}</text>
            </g>
          );
        })}
        {/* series */}
        {series.map((s) => {
          const pts = s.values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
          const line = smoothPath(pts);
          const area = `${line} L ${xAt(n - 1)} ${padT + innerH} L ${xAt(0)} ${padT + innerH} Z`;
          return (
            <g key={s.name}>
              <path className="chart-area" d={area} fill={`url(#area-${s.name})`} />
              <path className="chart-line" pathLength={1} d={line} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {/* x labels */}
        {labels.map((lb, i) => (
          (n <= 7 || i % Math.ceil(n / 6) === 0 || i === n - 1) && (
            <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle" className="fill-[#6B6762]" style={{ fontSize: 9.5, fontFamily: 'Geist, sans-serif' }}>{lb}</text>
          )
        ))}
        {/* hover */}
        {hi != null && (
          <g>
            <line x1={xAt(hi)} y1={padT} x2={xAt(hi)} y2={padT + innerH} stroke="#57534E" strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s) => <circle key={s.name} cx={xAt(hi)} cy={yAt(s.values[hi])} r={3.5} fill="#252523" stroke={s.color} strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hi != null && (
        <div className="absolute pointer-events-none z-10 bg-[#1A1917] border border-[#3D3A37] rounded-lg px-2.5 py-2 shadow-xl"
          style={{ left: Math.min(Math.max(xAt(hi) - 60, 4), w - 124), top: 8 }}>
          <p className="text-[10px] font-geist font-semibold text-[#8C8880] mb-1">{labels[hi]}</p>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 text-[11px] font-geist">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span className="text-[#C7C2BC]">{s.name}</span>
              <span className="text-[#F4F0EB] font-semibold tabular-nums ml-auto pl-3">{s.values[hi]}</span>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="flex items-center gap-4 mt-1 px-1">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[11px] font-geist text-[#A8A39B]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Donut (circle chart) — interactive ───────────────────────────────── */
export function Donut({ data, size = 180, stroke = 22, unit = 'total' }: {
  data: { label: string; value: number; color: string }[]; size?: number; stroke?: number; unit?: string;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2;
  const total = data.reduce((n, d) => n + d.value, 0) || 1;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="#2A2826" strokeWidth={stroke} />
          {data.map((d, i) => {
            const frac = d.value / total, dash = frac * c, off = c - acc;
            acc += dash;
            return (
              <circle key={i} className="donut-seg" cx={cx} cy={cx} r={r} fill="none" stroke={d.color}
                strokeWidth={hi === i ? stroke + 4 : stroke} strokeDasharray={`${dash} ${c - dash}`}
                strokeLinecap="butt" style={{ '--circ': c, '--off': off, strokeDashoffset: off, opacity: hi == null || hi === i ? 1 : 0.4 } as CSSProperties}
                transform={`rotate(${(acc - dash) / c * 360} ${cx} ${cx})`}
                onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[24px] font-geist font-semibold text-[#F4F0EB] tabular-nums leading-none">{hi == null ? total : data[hi].value}</p>
          <p className="text-[10px] font-geist text-[#8C8880] mt-1 max-w-[90px] truncate text-center">{hi == null ? unit : data[hi].label}</p>
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {data.map((d, i) => (
          <button key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
            className="w-full flex items-center gap-2 text-left group">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className={`text-[12px] font-geist truncate flex-1 transition-colors ${hi === i ? 'text-[#F4F0EB]' : 'text-[#C7C2BC]'}`}>{d.label}</span>
            <span className="text-[11.5px] font-geist text-[#8C8880] tabular-nums">{Math.round((d.value / total) * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Animated horizontal bars ─────────────────────────────────────────── */
export function BarList({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-geist text-[#C7C2BC] truncate">{d.label}</span>
            <span className="text-[11.5px] font-geist text-[#8C8880] tabular-nums">{d.value}</span>
          </div>
          <div className="h-2 rounded-full bg-[#1E1D1C] overflow-hidden">
            <div className="chart-bar h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: `linear-gradient(90deg, ${d.color}, ${d.color}aa)`, animationDelay: `${i * 0.06}s` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
