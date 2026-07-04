import { useEffect, useMemo, useState } from 'react';
import { Network, Share2, FileStack, Plug, TrendingUp, PieChart, BarChart3 } from 'lucide-react';
import { PALETTE, StatCard, AreaChart, Donut, BarList, Skeleton } from './charts';
import type { KnowledgeBase, Stats } from './types';

/**
 * Per-KB Insights — colourful, interactive charts over a single knowledge base.
 * Pure SVG (shared with the Dashboard via ./charts): smooth area line chart,
 * donut, animated bars, sparkline stat cards. Sourced live from this KB's own
 * Neo4j graph slice (GET /api/stats?kbId=…), so it reflects real ingested
 * content — not a mock overlay.
 */

const SOURCE_LABEL: Record<string, string> = {
  github: 'GitHub', jira: 'Jira', gdocs: 'Google Docs', gslides: 'Google Slides',
  gsheets: 'Google Sheets', gcal: 'Google Calendar', slack: 'Slack', salesforce: 'Salesforce',
  knowledge_graph: 'Extracted entities', kb: 'Knowledge base docs', other: 'Other',
};
const labelOf = (key: string) => SOURCE_LABEL[key] || key;

/* ── Main ─────────────────────────────────────────────────────────────── */
export default function KbInsights({ idToken, kb, refreshKey = 0 }: { idToken: string | null; kb: KnowledgeBase; refreshKey?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        if (idToken) {
          const res = await fetch(`/api/stats?kbId=${encodeURIComponent(kb.id)}`, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (res.ok && alive) setStats(await res.json());
        }
      } catch { /* keep last good snapshot */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [idToken, kb.id, refreshKey]);

  const docs = kb.documents || [];
  const sources = kb.sources || [];
  const itemCount = sources.reduce((n, s) => n + (s.items?.length || 0), 0);

  const timeline = stats?.timeline || [];
  const dailyNodes = timeline.map((d) => d.n);
  const cumulative = useMemo(() => {
    let a = 0; return dailyNodes.map((n) => (a += n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);
  const tlLabels = timeline.map((d) => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

  const distribution = useMemo(
    () => (stats?.bySource || [])
      .map((s, i) => ({ label: labelOf(s.key), value: s.n, color: PALETTE[i % PALETTE.length] }))
      .filter((d) => d.value > 0),
    [stats]
  );

  const composition = useMemo(
    () => (stats?.byType || [])
      .map((t, i) => ({ label: t.key, value: t.n, color: PALETTE[i % PALETTE.length] }))
      .filter((d) => d.value > 0)
      .slice(0, 8),
    [stats]
  );

  const nodes = stats?.graph?.nodes ?? 0;
  const edges = stats?.graph?.edges ?? 0;
  const isEmpty = nodes === 0 && docs.length === 0 && sources.length === 0;

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
          <StatCard label="Graph nodes" value={nodes} color="#C9A66B" Icon={Network} spark={cumulative} />
          <StatCard label="Relationships" value={edges} color="#8AA9C9" Icon={Share2} spark={cumulative.length > 1 ? cumulative : [0, edges]} />
          <StatCard label="Documents" value={docs.length} color="#C28379" Icon={FileStack} spark={cumulative} />
          <StatCard label="Sources" value={sources.length} sub={`${itemCount} items`} color="#8FAE97" Icon={Plug} spark={cumulative} />
        </div>

        {/* Growth area chart */}
        <div className="card-elev rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-[#C9A66B]" />
            <h3 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Knowledge growth</h3>
            <span className="text-[11.5px] font-geist text-[#6B6762] ml-auto">cumulative nodes · last 14 days</span>
          </div>
          {timeline.length ? (
            <AreaChart
              labels={tlLabels}
              series={[{ name: 'Graph nodes', color: '#C9A66B', values: cumulative }]}
            />
          ) : <p className="text-[12.5px] font-geist text-[#8C8880] py-8 text-center">Ingestion volume will chart here as the graph builds.</p>}
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
