import { useEffect, useMemo, useState } from 'react';
import { Network, Share2, FileStack, Plug, TrendingUp, PieChart, BarChart3 } from 'lucide-react';
import { PALETTE, StatCard, AreaChart, Donut, BarList, Skeleton } from './charts';
import type { GraphData, KnowledgeBase } from './types';

/**
 * Per-KB Insights — colourful, interactive charts over a single knowledge base.
 * Pure SVG (shared with the Dashboard via ./charts): smooth area line chart,
 * donut, animated bars, sparkline stat cards. Re-derives from the KB + its
 * graph, so it evolves as the parent re-polls.
 */

const TYPE_COLOR: Record<string, string> = {
  KnowledgeBase: '#C9A66B', Source: '#E8C9A0', Repository: '#C28379', Document: '#A9B8C9',
  Project: '#9C93B0', Channel: '#8FB0AE', Account: '#B58FA8', Slide: '#D8B48C', Spreadsheet: '#8FAE97',
  Event: '#9FB9A6', Entity: '#8AA9C9',
};
const colorOfType = (t: string, i: number) => TYPE_COLOR[t] || PALETTE[i % PALETTE.length];

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

  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-2xl" />)}
      </div>
      <Skeleton className="h-[300px] rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton className="h-[220px] rounded-2xl" />
        <Skeleton className="h-[220px] rounded-2xl" />
      </div>
    </div>
  );

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
