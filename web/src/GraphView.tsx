import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core';
import { useLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import '@react-sigma/core/lib/style.css';
import { RefreshCw, Loader2, Network, Boxes, X, Search } from 'lucide-react';
import type { GraphData, GraphNode } from './types';

/* A node as seen by the colour/size helpers — the app node, or a force-graph
   node that carries the original under `raw`. */
type NodeLike = { id: string; type: string; degree?: number; label?: string };

/* Distinct palette for community (cluster) colouring — the GraphRAG look. */
const COMMUNITY_COLORS = ['#8FAE97', '#8AA9C9', '#C9A66B', '#C28379', '#9C93B0', '#A9B8C9', '#BBB5A9', '#9FB9A6', '#D8B48C', '#7FA8B5', '#B58FA8', '#A8B58F'];
const communityColor = (i: number) => COMMUNITY_COLORS[((i % COMMUNITY_COLORS.length) + COMMUNITY_COLORS.length) % COMMUNITY_COLORS.length];

const ForceGraph3D = lazy(() => import('react-force-graph-3d'));

/* Node colour by entity type (structural + Cognee semantic types). */
const TYPE_COLOR: Record<string, string> = {
  KnowledgeBase: '#C9A66B', Source: '#E8C9A0', Repository: '#C28379', Commit: '#BBB5A9', CodeChange: '#8FAE97',
  WorkItem: '#8AA9C9', Document: '#A9B8C9', Project: '#9C93B0', Sprint: '#C9A66B',
  Event: '#9FB9A6', Person: '#A8A29A', Channel: '#8FB0AE', Account: '#B58FA8',
  Slide: '#D8B48C', Spreadsheet: '#8FAE97',
  // Cognee-extracted graph node types
  Entity: '#8AA9C9', EntityType: '#C9A66B', TextSummary: '#9C93B0',
  DocumentChunk: '#BBB5A9', TextDocument: '#C28379', NodeSet: '#8FAE97',
};
const colorOf = (t: string) => TYPE_COLOR[t] || '#8C8880';
const sizeOf = (n: NodeLike) => (n.type === 'KnowledgeBase' ? 16 : n.type === 'Source' ? 13 : n.type === 'Person' ? 7 : 5 + Math.min(n.degree || 0, 9));

/* Custom label renderer — draws a dark pill behind the text so labels stay
   readable over light-coloured nodes (plain white text vanished on them). */
function drawNodeLabel(context: CanvasRenderingContext2D, data: any, settings: any) {
  if (!data.label) return;
  const size = settings.labelSize || 13;
  context.font = `${settings.labelWeight || 600} ${size}px ${settings.labelFont || 'Geist, sans-serif'}`;
  const padX = 6, padY = 3;
  const textW = context.measureText(data.label).width;
  const x = data.x + data.size + 5;
  const y = data.y;
  context.fillStyle = 'rgba(20,19,18,0.86)';
  const bx = x - padX, by = y - size / 2 - padY, bw = textW + padX * 2, bh = size + padY * 2;
  if (context.roundRect) { context.beginPath(); context.roundRect(bx, by, bw, bh, 5); context.fill(); }
  else context.fillRect(bx, by, bw, bh);
  context.fillStyle = '#F4F0EB';
  context.textBaseline = 'middle';
  context.fillText(data.label, x, y);
}

/* HTML tooltip for the 3D view — matches the 2D label pill (Geist, dark chip,
   #F4F0EB text, coloured type dot). */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
function labelHTML(n: NodeLike) {
  return (
    `<div style="font-family:Geist,system-ui,sans-serif;font-size:12.5px;font-weight:600;color:#F4F0EB;` +
    `background:rgba(20,19,18,0.92);border:1px solid #3D3A37;border-radius:8px;padding:6px 10px;white-space:nowrap;` +
    `box-shadow:0 4px 14px rgba(0,0,0,0.45)">` +
    `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colorOf(n.type)};margin-right:7px;vertical-align:middle"></span>` +
    `${esc(n.label)}<span style="color:#8C8880;font-weight:500;margin-left:7px">${esc(n.type)}</span></div>`
  );
}

interface GraphSubProps {
  data: GraphData;
  hideTypes: Set<string>;
  onPick: (node: GraphNode) => void;
  colorFor: (n: NodeLike) => string;
}

/* ── Sigma 2D loader: builds the graphology graph, runs ForceAtlas2, wires events ── */
function SigmaGraph({ data, hideTypes, onPick, colorFor }: GraphSubProps) {
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  const { assign } = useLayoutForceAtlas2({
    iterations: 220,
    settings: { gravity: 3, scalingRatio: 12, slowDown: 6, barnesHutOptimize: true, adjustSizes: true },
  });
  const hoveredRef = useRef<string | null>(null);

  useEffect(() => {
    const graph = new Graph({ multi: true });
    // Cognee/semantic graphs can repeat node ids or omit them; addNode throws on
    // a duplicate, which would otherwise crash the whole app. Guard against both.
    const visible = data.nodes.filter((n) => !hideTypes.has(n.type) && n.id != null);
    const ids = new Set(visible.map((n) => n.id));
    visible.forEach((n, i) => {
      if (graph.hasNode(n.id)) return;
      const a = (i / Math.max(visible.length, 1)) * Math.PI * 2;
      graph.addNode(n.id, {
        x: Math.cos(a) * 100 + Math.random() * 10,
        y: Math.sin(a) * 100 + Math.random() * 10,
        size: sizeOf(n),
        label: n.label,
        color: colorFor(n),
        nodeType: n.type,
        raw: n,
      });
    });
    data.edges.forEach((e) => {
      if (ids.has(e.source) && ids.has(e.target)) {
        try { graph.addEdge(e.source, e.target, { size: 1.1, color: '#3D3A37', label: e.label || '' }); } catch { /* dup */ }
      }
    });
    loadGraph(graph);
    try { assign(); } catch { /* layout best-effort */ }

    // Hover highlight via reducers (dim non-neighbours)
    sigma.setSetting('nodeReducer', (node: string, attrs: any) => {
      const h = hoveredRef.current;
      if (h && node !== h && !graph.areNeighbors(h, node)) return { ...attrs, color: '#332F2C', label: '', zIndex: 0 };
      if (h && (node === h || graph.areNeighbors(h, node))) return { ...attrs, zIndex: 2, forceLabel: true };
      return attrs;
    });
    sigma.setSetting('edgeReducer', (edge: string, attrs: any) => {
      const h = hoveredRef.current;
      if (h && !graph.extremities(edge).includes(h)) return { ...attrs, hidden: true };
      if (h) return { ...attrs, color: '#6B645C', size: 1.6 };
      return attrs;
    });
  }, [data, hideTypes, loadGraph, assign, sigma, colorFor]);

  // Node dragging (sigma has no built-in drag — wire it up so nodes are grabbable).
  const draggedRef = useRef<string | null>(null);
  const movedRef = useRef(false);
  useEffect(() => {
    registerEvents({
      downNode: (e: any) => {
        draggedRef.current = e.node;
        movedRef.current = false;
        sigma.getGraph().setNodeAttribute(e.node, 'highlighted', true);
        if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
      },
      mousemovebody: (e: any) => {
        if (!draggedRef.current) return;
        movedRef.current = true;
        const pos = sigma.viewportToGraph(e);
        const g = sigma.getGraph();
        g.setNodeAttribute(draggedRef.current, 'x', pos.x);
        g.setNodeAttribute(draggedRef.current, 'y', pos.y);
        // Stop the camera from panning while a node is grabbed.
        e.preventSigmaDefault();
        e.original.preventDefault();
        e.original.stopPropagation();
      },
      mouseup: () => {
        if (draggedRef.current) sigma.getGraph().removeNodeAttribute(draggedRef.current, 'highlighted');
        draggedRef.current = null;
      },
      mousedown: () => { if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox()); },
      clickNode: (e: any) => { if (!movedRef.current) onPick(sigma.getGraph().getNodeAttribute(e.node, 'raw') as GraphNode); },
      enterNode: (e: any) => { hoveredRef.current = e.node; document.body.style.cursor = 'grab'; sigma.refresh(); },
      leaveNode: () => { hoveredRef.current = null; document.body.style.cursor = 'default'; sigma.refresh(); },
    });
  }, [registerEvents, sigma, onPick]);

  return null;
}

/* ── 3D explorer wrapper (lazy three.js) ── */
function Graph3D({ data, hideTypes, onPick, colorFor }: GraphSubProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setDims({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const gd = useMemo(() => {
    // Dedupe node ids (semantic graphs can repeat them) so the 3D renderer
    // doesn't choke / crash the view.
    const seen = new Set<string>();
    const nodes: { id: string; label: string; type: string; val: number; raw: GraphNode }[] = [];
    for (const n of data.nodes) {
      if (hideTypes.has(n.type) || n.id == null || seen.has(n.id)) continue;
      seen.add(n.id);
      nodes.push({ id: n.id, label: n.label, type: n.type, val: 1 + (n.degree || 0), raw: n });
    }
    const ids = new Set(nodes.map((n) => n.id));
    const links = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ source: e.source, target: e.target, label: e.label }));
    return { nodes, links };
  }, [data, hideTypes]);

  return (
    <div ref={ref} className="absolute inset-0">
      <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-[#57534E]" /></div>}>
        <ForceGraph3D
          ref={fgRef}
          graphData={gd}
          width={dims.w}
          height={dims.h}
          backgroundColor="#1A1917"
          nodeLabel={labelHTML}
          nodeColor={(n: any) => colorFor(n.raw || n)}
          nodeOpacity={0.95}
          nodeRelSize={4}
          nodeVal={(n: any) => n.val}
          linkColor={() => '#4A4744'}
          linkOpacity={0.45}
          linkWidth={0.6}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={1.4}
          linkDirectionalParticleColor={() => '#8FAE97'}
          onNodeClick={(n: any) => onPick(n.raw || n)}
          enableNodeDrag={true}
          warmupTicks={60}
          cooldownTicks={140}
          onEngineStop={() => fgRef.current?.zoomToFit(500, 60)}
        />
      </Suspense>
    </div>
  );
}

interface GraphViewProps {
  idToken: string | null;
  onAsk?: (q: string) => void;
  /** When set, the graph is scoped to a single knowledge base (its docs + sources). */
  kbId?: string;
  /** Hide the global toolbar chrome (used when embedded inside a KB tab). */
  embedded?: boolean;
  /** Bump to force a reload — e.g. after a source is attached/detached. */
  refreshKey?: number;
}

export default function GraphView({ idToken, onAsk, kbId, embedded = false, refreshKey = 0 }: GraphViewProps) {
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [mode, setMode] = useState<'structural' | 'cognee'>('structural');
  const [colorBy, setColorBy] = useState<'type' | 'community'>('type');
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [hideTypes, setHideTypes] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<GraphNode | null>(null);

  // Louvain community detection — clusters densely-connected nodes (GraphRAG
  // "communities"). Powers the cluster-coloured view.
  const communities = useMemo<Record<string, number>>(() => {
    if (!data?.nodes?.length) return {};
    const g = new Graph({ type: 'undirected' });
    data.nodes.forEach((n) => { if (!g.hasNode(n.id)) g.addNode(n.id); });
    data.edges.forEach((e) => {
      if (g.hasNode(e.source) && g.hasNode(e.target) && e.source !== e.target && !g.hasEdge(e.source, e.target)) {
        try { g.addEdge(e.source, e.target); } catch { /* ignore */ }
      }
    });
    try { return louvain(g); } catch { return {}; }
  }, [data]);
  const communityCount = useMemo(() => new Set(Object.values(communities)).size, [communities]);

  const colorFor = useMemo(() => (n: NodeLike) => (
    colorBy === 'community' && communities[n.id] != null ? communityColor(communities[n.id]) : colorOf(n.type)
  ), [colorBy, communities]);

  const communityList = useMemo(() => {
    const counts: Record<number, number> = {};
    Object.values(communities).forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
    return Object.entries(counts).map(([c, n]) => ({ c: Number(c), n })).sort((a, b) => b.n - a.n);
  }, [communities]);

  const load = async (m: 'structural' | 'cognee' = mode) => {
    setLoading(true);
    setTimeout(() => {
      // Mock Graph Data for local-first UI
      setData({
        nodes: [
          { id: '1', label: 'Knowledge Base', type: 'Concept', degree: 3 },
          { id: '2', label: 'Document A', type: 'Document', degree: 2 },
          { id: '3', label: 'Source File', type: 'File', degree: 1 },
          { id: '4', label: 'Integration', type: 'System', degree: 2 },
          { id: '5', label: 'Data Point', type: 'Entity', degree: 1 },
        ],
        edges: [
          { source: '1', target: '2', label: 'contains' },
          { source: '2', target: '3', label: 'references' },
          { source: '1', target: '4', label: 'uses' },
          { source: '4', target: '5', label: 'extracts' },
          { source: '2', target: '5', label: 'mentions' },
        ],
        stats: { nodes: 5, edges: 5 }
      });
      setLoading(false);
    }, 600);
  };
  useEffect(() => { load(mode); /* eslint-disable-next-line */ }, [idToken, mode, kbId, refreshKey]);

  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    setTimeout(() => {
      load(mode);
      setSyncing(false);
    }, 1500);
  };

  const presentTypes = useMemo(() => [...new Set((data?.nodes || []).map((n) => n.type))], [data]);
  const isEmpty = !loading && (!data || data.nodes.length === 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#252523] font-geist overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-6 lg:px-8 py-4 border-b border-[#3D3A37] shrink-0">
        <div className="min-w-0">
          <h1 className="text-[20px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">Knowledge Graph</h1>
          <p className="text-[12px] font-geist text-[#8C8880] mt-1.5 truncate">
            {data ? `${data.stats.nodes} nodes · ${data.stats.edges} edges` : (kbId ? 'Built from this base’s documents & sources' : 'Your unified, cross-tool graph')}
            {!kbId && (mode === 'cognee' ? ' · Cognee-extracted' : ' · structural')}
            {communityCount > 1 ? ` · ${communityCount} communities` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Data mode (global graph only — a KB graph is always its own sources) */}
          {!kbId && (
            <div className="hidden md:flex items-center bg-[#1E1D1C] border border-[#3D3A37] rounded-lg p-0.5">
              {(['structural', 'cognee'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1.5 text-[11.5px] font-geist font-medium rounded-md transition-colors ${mode === m ? 'bg-[#33302E] text-[#F4F0EB]' : 'text-[#8C8880] hover:text-[#F4F0EB]'}`}>
                  {m === 'structural' ? 'Structural' : 'Semantic'}
                </button>
              ))}
            </div>
          )}
          {/* Colour by */}
          <div className="hidden lg:flex items-center bg-[#1E1D1C] border border-[#3D3A37] rounded-lg p-0.5">
            {(['type', 'community'] as const).map((c) => (
              <button key={c} onClick={() => setColorBy(c)} className={`px-2.5 py-1.5 text-[11.5px] font-geist font-medium rounded-md transition-colors capitalize ${colorBy === c ? 'bg-[#33302E] text-[#F4F0EB]' : 'text-[#8C8880] hover:text-[#F4F0EB]'}`}>
                {c}
              </button>
            ))}
          </div>
          {/* 2D / 3D */}
          <div className="flex items-center bg-[#1E1D1C] border border-[#3D3A37] rounded-lg p-0.5">
            <button onClick={() => setView('2d')} className={`flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-geist font-medium rounded-md transition-colors ${view === '2d' ? 'bg-[#33302E] text-[#F4F0EB]' : 'text-[#8C8880] hover:text-[#F4F0EB]'}`}><Network size={13} /> 2D</button>
            <button onClick={() => setView('3d')} className={`flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-geist font-medium rounded-md transition-colors ${view === '3d' ? 'bg-[#33302E] text-[#F4F0EB]' : 'text-[#8C8880] hover:text-[#F4F0EB]'}`}><Boxes size={13} /> 3D</button>
          </div>
          <button onClick={syncNow} disabled={syncing} className="btn-bump btn-bump-accent px-3.5 py-2 text-[12.5px]">
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {kbId ? (syncing ? 'Rebuilding…' : 'Rebuild') : (syncing ? 'Syncing…' : 'Sync now')}
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-[#57534E]" /></div>
        ) : isEmpty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 px-6">
            <Network size={30} className="text-[#4A4744]" strokeWidth={1.5} />
            <p className="text-[14px] font-geist text-[#8C8880]">{kbId ? 'This knowledge base has no graph yet' : mode === 'cognee' ? 'Cognee is still building this graph' : 'Your graph is empty'}</p>
            <p className="text-[12px] font-geist text-[#6B6762] max-w-[340px]">
              {kbId ? 'Upload documents or attach a source to this knowledge base — they appear here as connected nodes.' : mode === 'cognee' ? 'Entity extraction (cognify) runs in the background after ingestion. Hit Sync now, then check back in a minute.' : 'Connect a source and ingest items — they appear here as connected nodes.'}
            </p>
          </div>
        ) : view === '3d' ? (
          <Graph3D data={data as GraphData} hideTypes={hideTypes} onPick={setSelected} colorFor={colorFor} />
        ) : (
          <SigmaContainer
            style={{ height: '100%', width: '100%', background: 'transparent' }}
            settings={{ allowInvalidContainer: true, renderLabels: true, labelColor: { color: '#F4F0EB' }, labelFont: 'Geist, system-ui', labelSize: 13, labelWeight: '600', labelDensity: 1, labelGridCellSize: 80, labelRenderedSizeThreshold: 1, zIndex: true, defaultEdgeColor: '#3D3A37', defaultDrawNodeLabel: drawNodeLabel, defaultDrawNodeHover: drawNodeLabel }}
          >
            <SigmaGraph data={data as GraphData} hideTypes={hideTypes} onPick={setSelected} colorFor={colorFor} />
          </SigmaContainer>
        )}

        {/* Legend — type filter, or community clusters */}
        {data && data.nodes.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-[#1E1D1C]/95 backdrop-blur border border-[#3D3A37] rounded-xl p-3 max-w-[210px] z-10">
            {colorBy === 'community' ? (
              <>
                <p className="text-[10px] font-geist font-semibold uppercase tracking-[0.12em] text-[#6B6762] mb-2">Communities · {communityCount}</p>
                <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto pr-1">
                  {communityList.map(({ c, n }, i) => (
                    <div key={c} className="flex items-center gap-2 text-[11.5px] font-geist">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: communityColor(c) }} />
                      <span className="text-[#C7C2BC] flex-1">Community {i + 1}</span>
                      <span className="text-[#8C8880] tabular-nums">{n}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] font-geist font-semibold uppercase tracking-[0.12em] text-[#6B6762] mb-2">Node types · click to filter</p>
                <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto pr-1">
                  {presentTypes.map((t) => {
                    const off = hideTypes.has(t);
                    return (
                      <button key={t} onClick={() => setHideTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; })}
                        className={`flex items-center gap-2 text-[11.5px] font-geist transition-opacity ${off ? 'opacity-35' : ''}`}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(t) }} />
                        <span className="text-[#C7C2BC]">{t}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Selected node panel */}
        {selected && (
          <div className="absolute top-4 right-4 w-[260px] bg-[#1E1D1C]/95 backdrop-blur border border-[#3D3A37] rounded-xl p-4 z-10 animate-slide-up">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="flex items-center gap-2 text-[10px] font-geist font-semibold uppercase tracking-[0.1em]" style={{ color: colorOf(selected.type) }}>
                <span className="w-2 h-2 rounded-full" style={{ background: colorOf(selected.type) }} /> {selected.type}
              </span>
              <button onClick={() => setSelected(null)} className="text-[#6B6762] hover:text-[#F4F0EB]"><X size={14} /></button>
            </div>
            <p className="text-[14px] font-geist font-semibold text-[#F4F0EB] leading-snug break-words">{selected.label}</p>
            {selected.status && <p className="text-[11.5px] font-geist text-[#8C8880] mt-1">Status: {selected.status}</p>}
            <p className="text-[11.5px] font-geist text-[#8C8880] mt-0.5">Connections: {selected.degree || 0}</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => onAsk?.(`Tell me about "${selected.label}" and what it connects to in my knowledge graph.`)} className="btn-bump btn-bump-accent flex-1 py-2 text-[12px]">Ask hypr</button>
              {selected.url && <a href={selected.url} target="_blank" rel="noreferrer" className="btn-bump btn-bump-dark px-3 py-2 text-[12px]">Open</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
