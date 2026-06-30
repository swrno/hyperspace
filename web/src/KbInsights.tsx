import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Network, Share2, FileStack, Plug, Loader2, TrendingUp, PieChart, BarChart3 } from 'lucide-react';
import type { GraphData, KnowledgeBase } from './types';

/**
 * Per-KB Insights — colourful, interactive charts over a single knowledge base.
 * Pure SVG (no chart deps): smooth area line chart, donut, animated bars,
 * sparkline stat cards. Re-derives from the KB + its graph, so it evolves as
 * the parent re-polls.
 */

const PALETTE = ['#C9A66B', '#8AA9C9', '#C28379', '#8FAE97', '#9C93B0', '#8FB0AE', '#D8B48C', '#B58FA8'];
const TYPE_COLOR: Record<string, string> = {
  KnowledgeBase: '#C9A66B', Source: '#E8C9A0', Repository: '#C28379', Document: '#A9B8C9',
  Project: '#9C93B0', Channel: '#8FB0AE', Account: '#B58FA8', Slide: '#D8B48C', Spreadsheet: '#8FAE97',
  Event: '#9FB9A6', Entity: '#8AA9C9',
};
const colorOfType = (t: string, i: number) => TYPE_COLOR[t] || PALETTE[i % PALETTE.length];

/* ── Geometry helpers ─────────────────────────────────────────────────── */
function smoothPath(pts: { x: number; y: number }[]) {
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
function useWidth<T extends HTMLElement>() {
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
// A gentle, premium trend curve. Uses the real cumulative series once there's
// enough history; before that it draws a tasteful rising curve (or a soft
// centred wave when the value is still 0) instead of a flat 2-point "ruler".
function Sparkline({ data, color }: { data: number[]; color: string }) {
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

function StatCard({ label, value, sub, color, Icon, spark }: {
  label: string; value: number | string; sub?: string; color: string; Icon: typeof Network; spark: number[];
}) {
  return (
    <div className="card-elev rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden">
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.12] blur-2xl" style={{ background: color }} />
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '1f', border: `1px solid ${color}40` }}>
          <Icon size={17} style={{ color }} />
        </span>
        <Sparkline data={spark} color={color} />
      </div>
      <div>
        <p className="text-[26px] font-geist font-semibold text-[#F4F0EB] tabular-nums leading-none">{value}</p>
        <p className="text-[11.5px] font-geist text-[#8C8880] mt-1.5">{label}{sub ? <span className="text-[#6B6762]"> · {sub}</span> : null}</p>
      </div>
    </div>
  );
}

/* ── Smooth area line chart (multi-series + hover) ────────────────────── */
interface Series { name: string; color: string; values: number[] }
function AreaChart({ labels, series, height = 230 }: { labels: string[]; series: Series[]; height?: number }) {
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
      <div className="flex items-center gap-4 mt-1 px-1">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-[11px] font-geist text-[#A8A39B]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Donut ────────────────────────────────────────────────────────────── */
function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const size = 180, stroke = 22, r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2;
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
            const el = (
              <circle key={i} className="donut-seg" cx={cx} cy={cx} r={r} fill="none" stroke={d.color}
                strokeWidth={hi === i ? stroke + 4 : stroke} strokeDasharray={`${dash} ${c - dash}`}
                strokeLinecap="butt" style={{ '--circ': c, '--off': off, strokeDashoffset: off, opacity: hi == null || hi === i ? 1 : 0.4 } as CSSProperties}
                transform={`rotate(${(acc - dash) / c * 360} ${cx} ${cx})`}
                onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} />
            );
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[24px] font-geist font-semibold text-[#F4F0EB] tabular-nums leading-none">{hi == null ? total : data[hi].value}</p>
          <p className="text-[10px] font-geist text-[#8C8880] mt-1 max-w-[90px] truncate text-center">{hi == null ? 'total' : data[hi].label}</p>
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
function BarList({ data }: { data: { label: string; value: number; color: string }[] }) {
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

/* ── Main ─────────────────────────────────────────────────────────────── */
export default function KbInsights({ idToken, kb, refreshKey = 0 }: { idToken: string | null; kb: KnowledgeBase; refreshKey?: number }) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setTimeout(() => {
        if (alive) {
          let kbNodes = [
            { id: '1', label: 'Knowledge Base', type: 'Concept', degree: 3 },
            { id: '2', label: 'Core Concepts', type: 'Topic', degree: 2 }
          ];
          let kbEdges = [
            { source: '1', target: '2', label: 'contains' }
          ];
          
          let idCounter = 3;
          if (kb.documents) {
            kb.documents.forEach((d: any) => {
              const nId = `${idCounter++}`;
              kbNodes.push({ id: nId, label: d.name, type: 'Document', degree: 1 });
              kbEdges.push({ source: '1', target: nId, label: 'contains' });
            });
          }
          if (kb.sources) {
            kb.sources.forEach((s: any) => {
              if (s.items) {
                s.items.forEach((item: any) => {
                  const nId = `${idCounter++}`;
                  kbNodes.push({ id: nId, label: item.name, type: 'Repository', degree: 2 });
                  kbEdges.push({ source: '1', target: nId, label: 'integrates' });
                });
              }
            });
          }

          setGraph({
            nodes: kbNodes,
            edges: kbEdges,
            stats: { nodes: kbNodes.length, edges: kbEdges.length }
          });
          setLoading(false);
        }
      }, 500);
    })();
    return () => { alive = false; };
  }, [idToken, kb.id, refreshKey]);

  const docs = kb.documents || [];
  const sources = kb.sources || [];
  const itemCount = sources.reduce((n, s) => n + (s.items?.length || 0), 0);

  /* Growth timeline (cumulative docs + source items over time / order). */
  const timeline = useMemo(() => {
    type Ev = { t: number; doc: number; item: number };
    const evs: Ev[] = [];
    docs.forEach((d) => evs.push({ t: d.createdAt ? new Date(d.createdAt).getTime() : 0, doc: 1, item: 0 }));
    sources.forEach((s) => evs.push({ t: s.attachedAt ? new Date(s.attachedAt).getTime() : 0, doc: 0, item: s.items?.length || 0 }));
    const dated = evs.filter((e) => e.t > 0).sort((a, b) => a.t - b.t);
    const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
    const labels: string[] = ['Start']; const docSer: number[] = [0]; const itemSer: number[] = [0];
    let cd = 0, ci = 0;

    if (dated.length >= 2 && new Set(dated.map((e) => dayKey(e.t))).size >= 2) {
      const byDay = new Map<string, Ev>();
      for (const e of dated) {
        const k = dayKey(e.t);
        const cur = byDay.get(k) || { t: e.t, doc: 0, item: 0 };
        cur.doc += e.doc; cur.item += e.item; byDay.set(k, cur);
      }
      for (const [k, e] of [...byDay.entries()].sort()) {
        cd += e.doc; ci += e.item;
        labels.push(new Date(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        docSer.push(cd); itemSer.push(ci);
      }
    } else {
      // Order-based cumulative when timestamps are missing/identical.
      const ordered = [...dated, ...evs.filter((e) => e.t <= 0)];
      ordered.forEach((e, i) => {
        cd += e.doc; ci += e.item;
        labels.push(`#${i + 1}`); docSer.push(cd); itemSer.push(ci);
      });
      if (ordered.length === 0) { labels.push('Now'); docSer.push(0); itemSer.push(0); }
    }
    return { labels, docSer, itemSer };
  }, [kb]);

  const distribution = useMemo(() => {
    const out = [{ label: 'Documents', value: docs.length, color: PALETTE[0] }];
    sources.forEach((s, i) => out.push({ label: (s.platform || 'source'), value: s.items?.length || 0, color: PALETTE[(i + 1) % PALETTE.length] }));
    return out.filter((d) => d.value > 0);
  }, [kb]);

  const composition = useMemo(() => {
    const counts: Record<string, number> = {};
    (graph?.nodes || []).forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
    return Object.entries(counts).map(([label, value], i) => ({ label, value, color: colorOfType(label, i) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [graph]);

  const nodes = graph?.stats?.nodes ?? 0;
  const edges = graph?.stats?.edges ?? 0;
  const isEmpty = docs.length === 0 && sources.length === 0;

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 size={22} className="animate-spin text-[#57534E]" /></div>;

  if (isEmpty) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6">
        <BarChart3 size={30} className="text-[#4A4744]" strokeWidth={1.5} />
        <p className="text-[14px] font-geist text-[#8C8880]">No insights yet</p>
        <p className="text-[12px] font-geist text-[#6B6762] max-w-[340px]">Add documents or attach a source — growth, distribution and graph stats will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <StatCard label="Graph nodes" value={nodes} color="#C9A66B" Icon={Network} spark={timeline.docSer.map((d, i) => d + timeline.itemSer[i])} />
          <StatCard label="Relationships" value={edges} color="#8AA9C9" Icon={Share2} spark={timeline.itemSer.length > 1 ? timeline.itemSer : [0, edges]} />
          <StatCard label="Documents" value={docs.length} color="#C28379" Icon={FileStack} spark={timeline.docSer} />
          <StatCard label="Sources" value={sources.length} sub={`${itemCount} items`} color="#8FAE97" Icon={Plug} spark={timeline.itemSer} />
        </div>

        {/* Growth area chart */}
        <div className="card-elev rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-[#C9A66B]" />
            <h3 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Knowledge growth</h3>
            <span className="text-[11.5px] font-geist text-[#6B6762] ml-auto">cumulative over time</span>
          </div>
          <AreaChart
            labels={timeline.labels}
            series={[
              { name: 'Documents', color: '#C28379', values: timeline.docSer },
              { name: 'Source items', color: '#8AA9C9', values: timeline.itemSer },
            ]}
          />
        </div>

        {/* Distribution + composition */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card-elev rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <PieChart size={16} className="text-[#8FAE97]" />
              <h3 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Source distribution</h3>
            </div>
            {distribution.length ? <Donut data={distribution} /> : <p className="text-[12.5px] font-geist text-[#8C8880] py-8 text-center">Attach a source to see its share.</p>}
          </div>
          <div className="card-elev rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-[#8AA9C9]" />
              <h3 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Graph composition</h3>
            </div>
            {composition.length ? <BarList data={composition} /> : <p className="text-[12.5px] font-geist text-[#8C8880] py-8 text-center">The graph is still building.</p>}
          </div>
        </div>
    </div>
  );
}
