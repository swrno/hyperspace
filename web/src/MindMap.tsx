import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes, FileText, Github, Network, Plus, Minus, Maximize2,
  FileStack, Waypoints, Layers,
} from 'lucide-react';
import type { KnowledgeBase } from './types';

/**
 * A centered, radial mind map of a single knowledge base.
 *
 *            doc ──┐                        ┌── repo
 *            doc ──┤── Documents   GitHub ──┤── repo
 *                  └──────────[ KB ]────────┘
 *
 * Branches radiate left + right from the root, balanced by size. Built directly
 * from the KB's own documents + attached sources (no network), so it evolves on
 * its own as the parent re-polls. Pure SVG + foreignObject, pan + zoom, no deps.
 */

const PLATFORM_LABEL: Record<string, string> = {
  github: 'GitHub', gdocs: 'Google Docs', gslides: 'Google Slides', gsheets: 'Google Sheets',
  gcal: 'Google Calendar', jira: 'Jira', slack: 'Slack', salesforce: 'Salesforce',
};
const PLATFORM_DESC: Record<string, string> = {
  github: 'Repositories, commits & pull requests', gdocs: 'Long-form documents & specs',
  gslides: 'Presentation decks', gsheets: 'Spreadsheets & tabular data', gcal: 'Meetings & events',
  jira: 'Issues, sprints & projects', slack: 'Channels & decisions', salesforce: 'Accounts & opportunities',
};
// Refined, on-brand palette (matches the graph view) — vivid but never garish.
const PALETTE = ['#C9A66B', '#8AA9C9', '#C28379', '#8FAE97', '#9C93B0', '#8FB0AE', '#D8B48C', '#B58FA8'];

const fmtBytes = (n?: number) => (!n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtDate = (iso?: string) => { try { return new Date(iso as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } };

interface Leaf { id: string; label: string; desc?: string }
interface Branch { id: string; label: string; desc: string; color: string; kind: 'doc' | 'source' | 'meta'; platform?: string; leaves: Leaf[] }

// Geometry (root-centred at 0,0).
const ROOT_W = 232, ROOT_H = 70;
const BRANCH_W = 176, BRANCH_H = 46;
const LEAF_W = 248, LEAF_H = 56;
const GAP_ROOT_BRANCH = 96, GAP_BRANCH_LEAF = 74, GAP_LEAF_V = 14, GAP_BRANCH_V = 34, PAD = 80;

export default function MindMap({ kb }: { kb: KnowledgeBase }) {
  /* ── Build the tree from the KB ─────────────────────────────────────── */
  const branches = useMemo<Branch[]>(() => {
    const out: Branch[] = [];
    let ci = 0;
    const nextColor = () => PALETTE[ci++ % PALETTE.length];

    const docs = kb.documents || [];
    out.push({
      id: 'documents', label: 'Documents', kind: 'doc', color: nextColor(),
      desc: `${docs.length} file${docs.length === 1 ? '' : 's'} grounding this base`,
      leaves: docs.length
        ? docs.map((d) => ({ id: d.id, label: d.name, desc: [String(d.type || 'text').toUpperCase(), fmtBytes(d.size), fmtDate(d.createdAt)].filter(Boolean).join(' · ') }))
        : [{ id: 'none', label: 'No documents yet', desc: 'Upload files in the Documents tab' }],
    });

    (kb.sources || []).forEach((s) => {
      const items = s.items || [];
      out.push({
        id: `src-${s.platform}`, label: PLATFORM_LABEL[s.platform] || s.platform, kind: 'source', platform: s.platform, color: nextColor(),
        desc: PLATFORM_DESC[s.platform] || 'Attached source',
        leaves: items.length
          ? items.map((it) => ({ id: it.id, label: it.name, desc: it.meta }))
          : [{ id: 'none', label: 'Connected', desc: 'No items selected' }],
      });
    });

    // A "Structure" branch that describes the graph itself, so the map always
    // narrates the whole base — not just raw items.
    const docCount = docs.length;
    const itemCount = (kb.sources || []).reduce((n, s) => n + (s.items?.length || 0), 0);
    const sourceCount = (kb.sources || []).length;
    const nodeCount = 1 + (docCount ? 1 + docCount : 0) + sourceCount + itemCount;
    out.push({
      id: 'structure', label: 'Structure', kind: 'meta', color: nextColor(),
      desc: 'How this knowledge base is wired',
      leaves: [
        { id: 'st-nodes', label: `${nodeCount} nodes`, desc: 'Entities in the knowledge graph' },
        { id: 'st-sources', label: `${sourceCount} source${sourceCount === 1 ? '' : 's'} · ${docCount} doc${docCount === 1 ? '' : 's'}`, desc: 'Connected inputs' },
        { id: 'st-created', label: `Created ${fmtDate(kb.createdAt) || '—'}`, desc: kb.description || 'No description' },
      ],
    });

    return out;
  }, [kb]);

  /* ── Lay branches out on two balanced sides ─────────────────────────── */
  const layout = useMemo(() => {
    const sized = branches.map((b) => {
      const n = Math.max(b.leaves.length, 1);
      const block = n * LEAF_H + (n - 1) * GAP_LEAF_V;
      return { b, n, span: Math.max(block, BRANCH_H), block };
    });
    // Greedy balance: largest branches first, assign to the lighter side.
    const order = [...sized].sort((a, c) => c.span - a.span);
    const sides: { right: typeof sized; left: typeof sized } = { right: [], left: [] };
    const load = { right: 0, left: 0 };
    for (const s of order) {
      const side = load.right <= load.left ? 'right' : 'left';
      sides[side].push(s); load[side] += s.span + GAP_BRANCH_V;
    }
    // Keep a stable top-to-bottom order within each side (by original index).
    const idx = new Map(branches.map((b, i) => [b.id, i]));
    sides.right.sort((a, c) => (idx.get(a.b.id)! - idx.get(c.b.id)!));
    sides.left.sort((a, c) => (idx.get(a.b.id)! - idx.get(c.b.id)!));

    type Placed = { b: Branch; side: 'right' | 'left'; bx: number; by: number; leafX: number; leaves: { leaf: Leaf; y: number }[] };
    const placed: Placed[] = [];
    let xMin = -ROOT_W / 2, xMax = ROOT_W / 2, yMin = -ROOT_H / 2, yMax = ROOT_H / 2;

    (['right', 'left'] as const).forEach((side) => {
      const list = sides[side];
      const total = list.reduce((acc, s) => acc + s.span, 0) + Math.max(list.length - 1, 0) * GAP_BRANCH_V;
      let y = -total / 2;
      const dir = side === 'right' ? 1 : -1;
      const bx = dir === 1 ? ROOT_W / 2 + GAP_ROOT_BRANCH : -(ROOT_W / 2 + GAP_ROOT_BRANCH + BRANCH_W);
      const leafX = dir === 1 ? bx + BRANCH_W + GAP_BRANCH_LEAF : bx - GAP_BRANCH_LEAF - LEAF_W;
      for (const s of list) {
        const cy = y + s.span / 2;
        const leafStart = cy - s.block / 2;
        const leaves = s.b.leaves.map((leaf, k) => ({ leaf, y: leafStart + k * (LEAF_H + GAP_LEAF_V) + LEAF_H / 2 }));
        placed.push({ b: s.b, side, bx, by: cy, leafX, leaves });
        y += s.span + GAP_BRANCH_V;
        xMin = Math.min(xMin, leafX); xMax = Math.max(xMax, leafX + LEAF_W);
        yMin = Math.min(yMin, leafStart - LEAF_H / 2); yMax = Math.max(yMax, leafStart + s.block);
      }
    });

    return { placed, bounds: { xMin: xMin - PAD, xMax: xMax + PAD, yMin: yMin - PAD, yMax: yMax + PAD } };
  }, [branches]);

  /* ── Pan + zoom ─────────────────────────────────────────────────────── */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [vp, setVp] = useState({ w: 800, h: 560 });
  const [t, setT] = useState({ x: 400, y: 280, k: 1 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setVp({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const { xMin, xMax, yMin, yMax } = layout.bounds;
    const cw = xMax - xMin, ch = yMax - yMin;
    const k = Math.min(vp.w / cw, vp.h / ch, 1.25);
    const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
    setT({ k, x: vp.w / 2 - cx * k, y: vp.h / 2 - cy * k });
  }, [layout.bounds, vp]);

  // Re-fit when the data or viewport changes (auto-evolve friendly).
  useEffect(() => { fit(); }, [fit, kb.id]);
  useEffect(() => { if (vp.w > 1) fit(); /* eslint-disable-next-line */ }, [vp.w, vp.h]);

  // Native (non-passive) wheel listener so zoom-to-cursor can preventDefault.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setT((p) => {
        const k = Math.max(0.25, Math.min(2.4, p.k * factor));
        const r = k / p.k;
        return { k, x: mx - (mx - p.x) * r, y: my - (my - p.y) * r };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }; };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setT((p) => ({ ...p, x: drag.current!.tx + (e.clientX - drag.current!.x), y: drag.current!.ty + (e.clientY - drag.current!.y) }));
  };
  const endDrag = () => { drag.current = null; };
  const zoom = (dir: 1 | -1) => setT((p) => {
    const k = Math.max(0.25, Math.min(2.4, p.k * (dir === 1 ? 1.2 : 1 / 1.2)));
    const r = k / p.k; const cx = vp.w / 2, cy = vp.h / 2;
    return { k, x: cx - (cx - p.x) * r, y: cy - (cy - p.y) * r };
  });

  /* ── Helpers ────────────────────────────────────────────────────────── */
  const link = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };
  const BranchIcon = ({ b, size }: { b: Branch; size: number }) =>
    b.kind === 'doc' ? <FileStack size={size} /> : b.kind === 'meta' ? <Layers size={size} />
      : b.platform === 'github' ? <Github size={size} /> : <Network size={size} />;

  const totalLeaves = branches.reduce((n, b) => n + b.leaves.filter((l) => l.id !== 'none').length, 0);

  return (
    <div className="relative h-full w-full bg-[#252523] overflow-hidden">
      {/* Subtle dotted backdrop for depth */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.5]"
        style={{ backgroundImage: 'radial-gradient(#33302E 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

      <div
        ref={wrapRef}
        className="mm-canvas absolute inset-0"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <svg width={vp.w} height={vp.h} className="block select-none">
          <defs>
            {layout.placed.map((p) => (
              <linearGradient key={`g-${p.b.id}`} id={`mm-grad-${p.b.id}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={p.b.color} stopOpacity="0.9" />
                <stop offset="100%" stopColor={p.b.color} stopOpacity="0.35" />
              </linearGradient>
            ))}
          </defs>

          <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
            {/* Connectors */}
            {layout.placed.map((p) => {
              const dim = hover && hover !== p.b.id;
              const rootEdge = p.side === 'right' ? ROOT_W / 2 - 6 : -ROOT_W / 2 + 6;
              const branchInner = p.side === 'right' ? p.bx : p.bx + BRANCH_W;
              const branchOuter = p.side === 'right' ? p.bx + BRANCH_W : p.bx;
              const leafEdge = p.side === 'right' ? p.leafX : p.leafX + LEAF_W;
              return (
                <g key={`lk-${p.b.id}`} style={{ opacity: dim ? 0.18 : 1, transition: 'opacity 0.2s ease' }}>
                  <path className="mm-link" pathLength={1} d={link(rootEdge, 0, branchInner, p.by)} stroke={p.b.color} strokeWidth={2.4} fill="none" strokeOpacity={0.85} />
                  {p.leaves.map((lf, i) => (
                    <path key={i} className="mm-link" pathLength={1} style={{ animationDelay: `${0.1 + i * 0.04}s` }}
                      d={link(branchOuter, p.by, leafEdge, lf.y)} stroke={p.b.color} strokeWidth={1.4} fill="none" strokeOpacity={0.5} />
                  ))}
                </g>
              );
            })}

            {/* Root */}
            <foreignObject x={-ROOT_W / 2} y={-ROOT_H / 2} width={ROOT_W} height={ROOT_H}>
              <div className="mm-node h-full flex items-center gap-3 px-4 rounded-2xl border border-[#57534E]"
                style={{ background: 'linear-gradient(180deg,#37332F 0%,#2B2926 100%)', boxShadow: '0 2px 0 0 #1a1917, 0 12px 30px rgba(0,0,0,0.45)' }}>
                <span className="w-9 h-9 rounded-xl bg-[#1E1D1C] border border-[#4A4744] flex items-center justify-center shrink-0">
                  <Boxes size={18} className="text-[#C9A66B]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-geist font-semibold text-[#F4F0EB] truncate leading-tight">{kb.name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9.5px] font-geist font-semibold uppercase tracking-[0.1em] text-[#C9A66B] bg-[#2A2724] border border-[#4A4744] px-1.5 py-0.5 rounded">Knowledge Base</span>
                    <span className="text-[10px] font-geist text-[#8C8880] tabular-nums">{totalLeaves} nodes</span>
                  </div>
                </div>
              </div>
            </foreignObject>

            {/* Branches + leaves */}
            {layout.placed.map((p) => {
              const dim = hover && hover !== p.b.id;
              return (
                <g key={`br-${p.b.id}`} style={{ opacity: dim ? 0.25 : 1, transition: 'opacity 0.2s ease' }}
                  onMouseEnter={() => setHover(p.b.id)} onMouseLeave={() => setHover(null)}>
                  {/* Branch pill */}
                  <foreignObject x={p.bx} y={p.by - BRANCH_H / 2} width={BRANCH_W} height={BRANCH_H}>
                    <div className="mm-node h-full flex items-center gap-2.5 px-3 rounded-xl border"
                      style={{ background: 'linear-gradient(180deg,#221F1D 0%,#1C1A18 100%)', borderColor: p.b.color + '70', boxShadow: `0 2px 0 0 #161514, inset 3px 0 0 0 ${p.b.color}` }}>
                      <span className="shrink-0" style={{ color: p.b.color }}><BranchIcon b={p.b} size={15} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-geist font-semibold text-[#F4F0EB] truncate leading-tight">{p.b.label}</p>
                        <p className="text-[9.5px] font-geist text-[#8C8880] truncate">{p.b.desc}</p>
                      </div>
                      <span className="text-[10px] font-geist font-semibold tabular-nums shrink-0" style={{ color: p.b.color }}>{p.b.leaves.filter((l) => l.id !== 'none').length}</span>
                    </div>
                  </foreignObject>

                  {/* Leaf cards */}
                  {p.leaves.map((lf, i) => (
                    <foreignObject key={lf.leaf.id + i} x={p.leafX} y={lf.y - LEAF_H / 2} width={LEAF_W} height={LEAF_H}>
                      <div className="mm-node h-full flex flex-col justify-center px-3 rounded-lg bg-[#1E1D1C] border border-[#33302E] hover:border-[#4A4744] transition-colors"
                        style={{ animationDelay: `${0.12 + i * 0.04}s`, boxShadow: `inset ${p.side === 'right' ? '2px' : '-2px'} 0 0 0 ${p.b.color}55` }}>
                        <div className="flex items-center gap-1.5">
                          <FileText size={11} className="shrink-0" style={{ color: p.b.color }} />
                          <p className="text-[12px] font-geist font-medium text-[#E9E4DD] truncate">{lf.leaf.label}</p>
                        </div>
                        {lf.leaf.desc && <p className="text-[10px] font-geist text-[#857F77] truncate mt-0.5 pl-[18px]">{lf.leaf.desc}</p>}
                      </div>
                    </foreignObject>
                  ))}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex flex-col gap-1.5 z-10">
        <button onClick={() => zoom(1)} title="Zoom in" className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1E1D1C]/95 backdrop-blur border border-[#3D3A37] text-[#A8A39B] hover:text-[#F4F0EB] hover:bg-[#2A2826] transition-colors"><Plus size={15} /></button>
        <button onClick={() => zoom(-1)} title="Zoom out" className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1E1D1C]/95 backdrop-blur border border-[#3D3A37] text-[#A8A39B] hover:text-[#F4F0EB] hover:bg-[#2A2826] transition-colors"><Minus size={15} /></button>
        <button onClick={fit} title="Fit to view" className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1E1D1C]/95 backdrop-blur border border-[#3D3A37] text-[#A8A39B] hover:text-[#F4F0EB] hover:bg-[#2A2826] transition-colors"><Maximize2 size={14} /></button>
      </div>

      {/* Footer hint */}
      <div className="absolute bottom-3 left-4 flex items-center gap-2 z-10 pointer-events-none">
        <span className="flex items-center gap-1.5 text-[11px] font-geist text-[#6B6762] bg-[#1E1D1C]/80 backdrop-blur border border-[#33302E] rounded-md px-2 py-1">
          <Waypoints size={12} className="text-[#C9A66B]" /> {branches.length} branches · scroll to zoom · drag to pan
        </span>
      </div>
    </div>
  );
}
