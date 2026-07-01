import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Plus, Database, Blocks, Network, Share2, FileText, Boxes,
  TrendingUp, PieChart, BarChart3, History, GitPullRequest, GitCommitHorizontal,
  CalendarDays, FolderGit2, CircleDot, User, Target, ExternalLink, Layers,
  Search, type LucideIcon,
} from 'lucide-react';
import { StatCard, AreaChart, Donut, BarList, Skeleton } from './charts';
import type {
  ActiveScreen, Connectors, PlatformIconFn, RecentItem, Stats, StatsConnection, User as AppUser,
} from './types';

interface MetaEntry { label: string; color: string }

/* Warm, desaturated palette — color is a hint, never decoration. */
const SRC_META: Record<string, MetaEntry> = {
  github:     { label: 'GitHub',          color: '#BBB5A9' },
  jira:       { label: 'Jira',            color: '#8AA9C9' },
  gdocs:      { label: 'Google Docs',     color: '#8FAE97' },
  gslides:    { label: 'Google Slides',   color: '#C9A66B' },
  gsheets:    { label: 'Google Sheets',   color: '#8FB59A' },
  gcal:       { label: 'Google Calendar', color: '#8AA9C9' },
  slack:      { label: 'Slack',           color: '#C28379' },
  salesforce: { label: 'Salesforce',      color: '#9C93B0' },
};
const COMING_SOON = ['slack', 'salesforce'];

const TYPE_META: Record<string, MetaEntry & { Icon: LucideIcon }> = {
  WorkItem:   { label: 'Work items',    color: '#8AA9C9', Icon: CircleDot },
  CodeChange: { label: 'Pull requests', color: '#8FAE97', Icon: GitPullRequest },
  Commit:     { label: 'Commits',       color: '#BBB5A9', Icon: GitCommitHorizontal },
  Sprint:     { label: 'Sprints',       color: '#C9A66B', Icon: Target },
  Project:    { label: 'Projects',      color: '#9C93B0', Icon: FolderGit2 },
  Repository: { label: 'Repositories',  color: '#C28379', Icon: FolderGit2 },
  Document:   { label: 'Documents',     color: '#A9B8C9', Icon: FileText },
  Event:      { label: 'Events',        color: '#9FB9A6', Icon: CalendarDays },
  Person:     { label: 'People',        color: '#A8A29A', Icon: User },
};
const typeMeta = (k: string): MetaEntry & { Icon: LucideIcon } =>
  TYPE_META[k] || { label: k, color: '#9C968E', Icon: Layers };

/* WorkItem / activity status → a single warm signal colour. */
const statusColor = (s?: string): string => {
  const k = (s || '').toLowerCase();
  if (/(done|closed|merged|complete|resolved|shipped)/.test(k)) return '#8FAE97';
  if (/(progress|review|active|doing)/.test(k)) return '#C9A66B';
  if (/(block|error|fail|overdue|stuck)/.test(k)) return '#C28379';
  return '#8AA9C9';
};

const fmtAgo = (iso?: string): string | null => {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return null;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Representative analytics shown only while the real graph is still empty
 * (fresh account / pre-ingestion), so the dashboard demonstrates itself.
 * Modeled on the README's GraphRAG domain. The instant /api/stats returns real
 * entities, the live snapshot takes over and the "Sample data" badge disappears.
 */
const agoIso = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();
const dayIso = (back: number) => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);
const SAMPLE_DAILY = [9, 14, 11, 6, 4, 22, 19, 27, 13, 31, 24, 8, 17, 12];
const SAMPLE_STATS: Stats = {
  total: 164,
  documents: 17,
  graph: { nodes: 198, edges: 437 },
  byType: [
    { key: 'Commit', n: 58 }, { key: 'WorkItem', n: 34 }, { key: 'CodeChange', n: 21 },
    { key: 'Document', n: 17 }, { key: 'Person', n: 12 }, { key: 'Event', n: 9 },
    { key: 'Sprint', n: 6 }, { key: 'Repository', n: 4 }, { key: 'Project', n: 3 },
  ],
  bySource: [
    { key: 'github', n: 83 }, { key: 'jira', n: 49 }, { key: 'gdocs', n: 17 },
    { key: 'gcal', n: 9 }, { key: 'gslides', n: 6 },
  ],
  byStatus: [
    { key: 'Done', n: 14 }, { key: 'In Progress', n: 11 }, { key: 'To Do', n: 6 }, { key: 'In Review', n: 3 },
  ],
  timeline: SAMPLE_DAILY.map((n, i) => ({ date: dayIso(13 - i), n })),
  recent: [
    { id: 's1', type: 'CodeChange', source: 'github', title: '#142 · Fix token refresh race in auth middleware', status: 'Merged', repoRef: 'hyperspace/api', updatedAt: agoIso(28) },
    { id: 's2', type: 'WorkItem', source: 'jira', title: 'HYP-218 · Graph self-correction: de-duplicate entity nodes', status: 'In Progress', projectRef: 'HYP', updatedAt: agoIso(124) },
    { id: 's3', type: 'Commit', source: 'github', title: 'a3f9c2 · Add Reciprocal Rank Fusion to retrieval loop', repoRef: 'hyperspace/engine', updatedAt: agoIso(190) },
    { id: 's4', type: 'Document', source: 'gdocs', title: 'Enterprise GraphRAG — Architecture v2', updatedAt: agoIso(320) },
    { id: 's5', type: 'WorkItem', source: 'jira', title: 'HYP-203 · 30-min delta sync for GitHub audit logs', status: 'Done', projectRef: 'HYP', updatedAt: agoIso(505) },
    { id: 's6', type: 'CodeChange', source: 'github', title: '#138 · Cognee upsert: OPEN → MERGED edge transition', status: 'Merged', repoRef: 'hyperspace/engine', updatedAt: agoIso(1490) },
    { id: 's7', type: 'Event', source: 'gcal', title: 'Sprint 14 planning · retrieval quality', updatedAt: agoIso(1620) },
    { id: 's8', type: 'Commit', source: 'github', title: '7b1e90 · Multi-hop traversal: follow Issue → PR → Commit', repoRef: 'hyperspace/engine', updatedAt: agoIso(2880) },
  ],
};

interface DashboardProps {
  user: AppUser | null;
  idToken: string | null;
  connectors?: Connectors;
  onNavigate?: (screen: ActiveScreen) => void;
  onAsk?: (q: string) => void;
  platformIcon?: PlatformIconFn;
  kbsCount?: number;
}

interface SourceRow extends MetaEntry {
  id: string;
  connected: boolean;
  count: number;
  syncing: boolean;
  syncStatus?: StatsConnection['initialSyncStatus'];
}

/* Small framed section header used across the analytics panels. */
function PanelHead({ Icon, color, title, hint }: { Icon: LucideIcon; color: string; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '1f', border: `1px solid ${color}38` }}>
        <Icon size={14.5} style={{ color }} strokeWidth={1.9} />
      </span>
      <h3 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">{title}</h3>
      {hint && <span className="text-[11.5px] font-geist text-[#6B6762] ml-auto">{hint}</span>}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-[12.5px] font-geist text-[#8C8880] py-10 text-center">{text}</p>;
}

export default function Dashboard({ user, idToken, connectors = {}, onNavigate, onAsk, platformIcon, kbsCount = 0 }: DashboardProps) {
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const firstName = (user?.name || 'there').split(' ')[0];
  const hour = new Date().getHours();
  const partOfDay = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Working late';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const icon = (id: string, size?: number) => (platformIcon ? platformIcon({ id }, size) : null);

  /* ── Live data: poll the real graph stats; faster while ingesting ─────── */
  const liveByProvider = useMemo<Record<string, StatsConnection>>(
    () => Object.fromEntries((stats?.connections || []).map((c) => [c.provider, c])),
    [stats]
  );
  const anyIngesting = (stats?.connections || []).some((c) => c.initialSyncStatus === 'in_progress');

  useEffect(() => {
    let alive = true;
    const loadStats = async () => {
      if (!idToken) { setLoading(false); return; }
      try {
        const res = await fetch('/api/stats', { headers: { Authorization: `Bearer ${idToken}` } });
        if (res.ok && alive) setStats(await res.json());
      } catch { /* keep last good snapshot */ }
      if (alive) setLoading(false);
    };
    loadStats();
    const interval = setInterval(loadStats, anyIngesting ? 4000 : 30000);
    return () => { alive = false; clearInterval(interval); };
  }, [idToken, anyIngesting]);

  /* ── Derived series & distributions ───────────────────────────────────── */
  const realBySource = useMemo<Record<string, number>>(
    () => Object.fromEntries((stats?.bySource || []).map((s) => [s.key, s.n])),
    [stats]
  );

  const sources = useMemo<SourceRow[]>(
    () => Object.keys(SRC_META).map((id) => {
      const live = liveByProvider[id];
      const demoN = connectors?.[id]?.selectedItems?.length || 0;
      const connected = !!connectors?.[id]?.connected || !!live;
      const count = realBySource[id] ?? demoN;
      const syncing = live?.initialSyncStatus === 'in_progress';
      return { id, ...SRC_META[id], connected, count, syncing, syncStatus: live?.initialSyncStatus };
    }),
    [liveByProvider, realBySource, connectors]
  );
  const connectedCount = sources.filter((s) => s.connected).length;

  // Real data once the graph has anything in it; otherwise a labeled sample so
  // the dashboard demonstrates itself. Connected-sources panel always stays real.
  const isLive = !!stats && (
    (stats.total || 0) > 0 ||
    (stats.timeline || []).some((d) => d.n > 0) ||
    (stats.recent || []).length > 0
  );
  const view: Stats = isLive ? (stats as Stats) : SAMPLE_STATS;

  const timeline = view.timeline || [];
  const daily = timeline.map((d) => d.n);
  const cumulative = useMemo(() => {
    let a = 0; return daily.map((n) => (a += n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const tlLabels = timeline.map((d) => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const ingested14d = daily.reduce((s, n) => s + n, 0);

  const total = view.total || 0;
  const graphNodes = view.graph?.nodes ?? total;
  const graphEdges = view.graph?.edges ?? 0;
  const documents = view.documents ?? 0;
  const avgDegree = graphNodes ? (graphEdges * 2) / graphNodes : 0;

  const composition = useMemo(
    () => (view.byType || [])
      .map((t) => ({ label: typeMeta(t.key).label, value: t.n, color: typeMeta(t.key).color }))
      .filter((d) => d.value > 0)
      .slice(0, 7),
    [view]
  );
  const sourceBars = useMemo(
    () => (view.bySource || [])
      .map((s) => ({ label: SRC_META[s.key]?.label || s.key, value: s.n, color: SRC_META[s.key]?.color || '#9C968E' }))
      .filter((d) => d.value > 0),
    [view]
  );
  const statusBars = useMemo(
    () => (view.byStatus || [])
      .map((s) => ({ label: s.key, value: s.n, color: statusColor(s.key) }))
      .filter((d) => d.value > 0),
    [view]
  );

  const recent: RecentItem[] = view.recent || [];

  const appsCount = (() => { try { return JSON.parse(localStorage.getItem('hs_apps') || '[]').length; } catch { return 0; } })();
  const suggestions = [
    'What changed across my repos this week?',
    'Summarize open work items and their owners',
    'Which pull requests reference Jira tickets?',
  ];
  const submitAsk = (q?: string) => { const t = (q ?? query).trim(); if (t) onAsk?.(t); };

  /* ── Skeleton (first paint only) ──────────────────────────────────────── */
  if (loading && !stats) {
    return (
      <div className="flex-1 overflow-y-auto bg-[#252523] font-geist">
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-8 lg:py-10 animate-fade-in">
          {/* header */}
          <Skeleton className="h-9 w-72 rounded-lg" />
          <Skeleton className="h-4 w-56 rounded mt-3" />
          {/* ask bar */}
          <Skeleton className="h-12 w-full rounded-2xl mt-7" />
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-2xl" />)}
          </div>
          {/* ingestion chart + composition donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
            <Skeleton className="h-[300px] rounded-2xl lg:col-span-2" />
            <Skeleton className="h-[300px] rounded-2xl" />
          </div>
          {/* source bars + status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <Skeleton className="h-[200px] rounded-2xl" />
            <Skeleton className="h-[200px] rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#252523] font-geist animate-fade-in">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-8 lg:py-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
          <div>
            <h1 className="text-[30px] lg:text-[34px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">
              {partOfDay}, {firstName}
            </h1>
            <p className="text-[13.5px] font-geist text-[#8C8880] mt-2 flex items-center gap-2 flex-wrap">
              <span>{dateStr}</span>
              <span className="text-[#4A4744]">·</span>
              <span>{connectedCount} source{connectedCount === 1 ? '' : 's'} connected</span>
              {anyIngesting && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#2A2318] border border-[#5A4A28] text-[11px] font-medium text-[#C9A66B]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C9A66B] animate-pulse" /> Syncing
                </span>
              )}
              {!isLive && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#2C2A28] border border-[#3D3A37] text-[11px] font-medium text-[#9C968E]" title="Connect a source and run a sync to see your own analytics">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8C8880]" /> Sample data
                </span>
              )}
            </p>
          </div>
          <button onClick={() => onNavigate?.('integrations')} className="btn-bump btn-bump-dark px-3.5 py-2 text-[12.5px] self-start sm:self-auto">
            <Blocks size={15} strokeWidth={1.75} /> Connect sources
          </button>
        </div>

        {/* Ask bar — straight into chat grounded on the graph */}
        <form
          onSubmit={(e) => { e.preventDefault(); submitAsk(); }}
          className="card-elev rounded-2xl px-4 py-3 flex items-center gap-3 mb-7 focus-within:border-[#57534E] transition-colors"
        >
          <Search size={17} className="text-[#6B6762] shrink-0" strokeWidth={1.9} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask across everything you've connected…"
            className="flex-1 bg-transparent outline-none text-[14px] text-[#F4F0EB] placeholder:text-[#6B6762] min-w-0"
          />
          <button type="submit" disabled={!query.trim()} className="btn-bump btn-bump-accent px-3.5 py-1.5 text-[12.5px] shrink-0">
            Ask <ArrowRight size={14} strokeWidth={2} />
          </button>
        </form>

        {/* KPI strip — live graph metrics with sparklines */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard label="Knowledge nodes" value={graphNodes.toLocaleString()} color="#C9A66B" Icon={Network} spark={cumulative} />
          <StatCard label="Relationships" value={graphEdges.toLocaleString()} color="#8AA9C9" Icon={Share2} spark={cumulative} />
          <StatCard label="Entities" value={total.toLocaleString()} sub={`${ingested14d} in 14d`} color="#C28379" Icon={Boxes} spark={cumulative} />
          <StatCard label="Documents" value={documents.toLocaleString()} color="#8FAE97" Icon={FileText} spark={daily} />
        </div>

        {/* Ingestion line chart + entity composition donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <div className="card-elev rounded-2xl p-5 lg:col-span-2">
            <PanelHead Icon={TrendingUp} color="#C9A66B" title="Knowledge ingestion" hint={`${ingested14d} entities · last 14 days`} />
            {timeline.length ? (
              <AreaChart
                labels={tlLabels}
                series={[{ name: 'Entities', color: '#C9A66B', values: daily }]}
                height={236}
              />
            ) : <EmptyHint text="Connect a source — ingestion volume will chart here as the graph builds." />}
          </div>
          <div className="card-elev rounded-2xl p-5">
            <PanelHead Icon={PieChart} color="#8FAE97" title="Composition" hint="by type" />
            {composition.length
              ? <Donut data={composition} unit="entities" />
              : <EmptyHint text="No entities yet. Selected items populate the graph after their first sync." />}
          </div>
        </div>

        {/* Source distribution + work-item status (graph overview fallback) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div className="card-elev rounded-2xl p-5">
            <PanelHead Icon={BarChart3} color="#8AA9C9" title="Knowledge by source" />
            {sourceBars.length
              ? <BarList data={sourceBars} />
              : <EmptyHint text="Once a connector finishes syncing, its share of the graph appears here." />}
          </div>
          <div className="card-elev rounded-2xl p-5">
            <PanelHead Icon={Target} color="#9C93B0" title={statusBars.length ? 'Work item status' : 'Graph overview'} />
            {statusBars.length ? (
              <BarList data={statusBars} />
            ) : (
              <div className="grid grid-cols-3 gap-3 pt-1">
                {[
                  { k: 'Nodes', v: graphNodes, c: '#C9A66B' },
                  { k: 'Edges', v: graphEdges, c: '#8AA9C9' },
                  { k: 'Avg links', v: avgDegree ? avgDegree.toFixed(1) : '0', c: '#8FAE97' },
                ].map((m) => (
                  <div key={m.k} className="rounded-xl bg-[#1E1D1C] border border-[#33302E] p-3.5 flex flex-col gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: m.c }} />
                    <span className="text-[22px] font-geist font-semibold text-[#F4F0EB] tabular-nums leading-none">{m.v}</span>
                    <span className="text-[11px] font-geist text-[#8C8880]">{m.k}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent activity + connected sources */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Recent activity feed */}
          <div className="card-elev rounded-2xl p-5 lg:col-span-7">
            <PanelHead Icon={History} color="#C28379" title="Recent activity" hint={recent.length ? `${recent.length} latest` : undefined} />
            {recent.length ? (
              <div className="flex flex-col">
                {recent.map((r, i) => {
                  const tm = typeMeta(r.type);
                  const ago = fmtAgo(r.updatedAt);
                  const ref = r.repoRef || r.projectRef;
                  return (
                    <a
                      key={r.id || i}
                      href={r.url || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-3 py-2.5 border-b border-[#2E2C2A] last:border-0 -mx-1.5 px-1.5 rounded-lg hover:bg-[#2A2826] transition-colors"
                    >
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: tm.color + '1a', border: `1px solid ${tm.color}33` }}>
                        <tm.Icon size={15} style={{ color: tm.color }} strokeWidth={1.85} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-geist text-[#F4F0EB] truncate">{r.title || 'Untitled'}</p>
                        <p className="text-[11.5px] font-geist text-[#8C8880] truncate flex items-center gap-1.5">
                          <span>{tm.label}</span>
                          {ref && <><span className="text-[#4A4744]">·</span><span className="truncate">{ref}</span></>}
                          {SRC_META[r.source] && <><span className="text-[#4A4744]">·</span><span>{SRC_META[r.source].label}</span></>}
                        </p>
                      </div>
                      {r.status && (
                        <span className="text-[10.5px] font-geist font-medium px-2 py-0.5 rounded-md shrink-0 hidden sm:inline-block"
                          style={{ color: statusColor(r.status), background: statusColor(r.status) + '1a', border: `1px solid ${statusColor(r.status)}30` }}>
                          {r.status}
                        </span>
                      )}
                      {ago && <span className="text-[11px] font-geist text-[#6B6762] tabular-nums shrink-0 w-14 text-right">{ago}</span>}
                      {r.url && <ExternalLink size={13} className="text-[#4A4744] group-hover:text-[#8C8880] transition-colors shrink-0" />}
                    </a>
                  );
                })}
              </div>
            ) : (
              <EmptyHint text="Activity from your connected tools — PRs, commits, tickets and docs — will stream in here." />
            )}
          </div>

          {/* Right rail: quick nav + connected sources */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => onNavigate?.('applications')} className="card-elev card-elev-hover rounded-2xl p-4 text-left flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#1E1D1C] border border-[#3D3A37]"><Boxes size={17} className="text-[#9C968E]" strokeWidth={1.85} /></span>
                  <ArrowRight size={15} className="text-[#6B6762]" />
                </div>
                <div>
                  <p className="text-[24px] font-geist font-semibold text-[#F4F0EB] tabular-nums leading-none">{appsCount}</p>
                  <p className="text-[11.5px] font-geist text-[#8C8880] mt-1.5">Applications</p>
                </div>
              </button>
              <button onClick={() => onNavigate?.('knowledge')} className="card-elev card-elev-hover rounded-2xl p-4 text-left flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#1E1D1C] border border-[#3D3A37]"><Database size={17} className="text-[#9C968E]" strokeWidth={1.85} /></span>
                  <ArrowRight size={15} className="text-[#6B6762]" />
                </div>
                <div>
                  <p className="text-[24px] font-geist font-semibold text-[#F4F0EB] tabular-nums leading-none">{kbsCount}</p>
                  <p className="text-[11.5px] font-geist text-[#8C8880] mt-1.5">Knowledge bases</p>
                </div>
              </button>
            </div>

            <div className="card-elev rounded-2xl p-5 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Connected sources</h3>
                <span className="text-[12px] font-geist font-medium text-[#8C8880] tabular-nums">{connectedCount}/{Object.keys(SRC_META).length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-0.5">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#1E1D1C] border border-[#3D3A37]">
                      {icon(s.id, 17)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-geist font-medium text-[#F4F0EB] truncate">{s.label}</p>
                      <p className="text-[11px] font-geist text-[#8C8880] mt-0.5">
                        {s.syncing ? 'Syncing…' : s.connected ? (s.count ? `${s.count} items` : 'Connected') : 'Not connected'}
                      </p>
                    </div>
                    {s.connected ? (
                      <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-geist font-medium text-[#8FAE97] bg-[#1E2A22] border border-[#2E4636] shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full bg-[#8FAE97] ${s.syncing ? 'animate-pulse' : ''}`} /> {s.syncing ? 'Sync' : 'Active'}
                      </span>
                    ) : COMING_SOON.includes(s.id) ? (
                      <span className="text-[9.5px] font-geist font-semibold text-[#C9A66B] bg-[#2A2318] border border-[#5A4A28] px-1.5 py-1 rounded-md uppercase tracking-wide shrink-0">Soon</span>
                    ) : (
                      <button onClick={() => onNavigate?.('integrations')} className="bg-[#F4F0EB] hover:bg-[#EAE5DF] text-[#1E1D1C] px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.2)]">Connect</button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => onNavigate?.('integrations')} className="btn-bump btn-bump-dark w-full mt-5 py-2.5 text-[12.5px]">
                <Plus size={15} strokeWidth={2} /> Manage integrations
              </button>
            </div>
          </div>
        </div>

        {/* Suggestions — only while showing sample data, to guide first use */}
        {!isLive && (
          <div className="flex flex-wrap items-center gap-2 mt-6">
            <span className="text-[12px] font-geist text-[#6B6762]">Try asking</span>
            {suggestions.map((q) => (
              <button key={q} onClick={() => submitAsk(q)} className="text-[12px] font-geist text-[#C7C2BC] bg-[#2C2A28] border border-[#3D3A37] hover:border-[#57534E] rounded-full px-3 py-1.5 transition-colors">
                {q}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
