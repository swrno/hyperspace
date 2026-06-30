import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, ArrowRight, Plus, Database, Blocks, Search,
  Network, FileText, Loader2, Activity, type LucideIcon,
} from 'lucide-react';
import type {
  ActiveScreen, Connectors, PlatformIconFn, RecentItem, Stats, StatsConnection, User,
} from './types';

interface MetaEntry {
  label: string;
  color: string;
}

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
const TYPE_META: Record<string, MetaEntry> = {
  WorkItem:   { label: 'Work items',   color: '#8AA9C9' },
  CodeChange: { label: 'Pull requests', color: '#8FAE97' },
  Commit:     { label: 'Commits',      color: '#BBB5A9' },
  Sprint:     { label: 'Sprints',      color: '#C9A66B' },
  Project:    { label: 'Projects',     color: '#9C93B0' },
  Repository: { label: 'Repositories', color: '#C28379' },
  Document:   { label: 'Documents',    color: '#A9B8C9' },
  Event:      { label: 'Events',       color: '#9FB9A6' },
  Person:     { label: 'People',       color: '#A8A29A' },
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

interface DonutSegment {
  n: number;
  color: string;
}

/* ── Donut (circle) chart — pure SVG, no deps ─────────────────────────────── */
function Donut({ segments, total, size = 176, thickness = 24 }: {
  segments: DonutSegment[];
  total: number;
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#33302E" strokeWidth={thickness} />
          {total > 0 && segments.map((s, i) => {
            const dash = (s.n / total) * C;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-acc}
              />
            );
            acc += dash;
            return seg;
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] font-geist font-semibold text-[#F4F0EB] leading-none tabular-nums">{total}</span>
        <span className="text-[10.5px] font-geist text-[#8C8880] mt-1 uppercase tracking-[0.12em]">nodes</span>
      </div>
    </div>
  );
}

/* ── Activity bars — pure SVG/flex, no deps ───────────────────────────────── */
function Bars({ data }: { data: { n: number; date: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="flex items-end gap-1 h-[140px]">
      {data.map((d, i) => (
        <div key={i} className="flex-1 h-full flex flex-col justify-end group relative">
          <div
            className="w-full rounded-t-[3px] bg-[#4C5A50] group-hover:bg-[#8FAE97] transition-colors"
            style={{ height: `${Math.max((d.n / max) * 100, d.n > 0 ? 4 : 1.5)}%` }}
          />
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 px-2 py-1 rounded-md bg-[#1E1D1C] border border-[#3D3A37] text-[10.5px] font-geist text-[#F4F0EB] whitespace-nowrap tabular-nums">
            {d.n} · {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, Icon }: {
  label: string;
  value: number | string;
  sub?: string;
  Icon: LucideIcon;
}) {
  return (
    <div className="card-elev rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-geist font-medium text-[#8C8880] tracking-tight">{label}</span>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1E1D1C] border border-[#3D3A37]">
          <Icon size={15} className="text-[#9C968E]" strokeWidth={1.75} />
        </span>
      </div>
      <div className="flex items-end justify-between">
        <span className="font-geist font-semibold text-[#F4F0EB] text-[34px] leading-none tracking-tight tabular-nums">{value}</span>
        {sub && <span className="text-[11.5px] font-geist font-medium text-[#8C8880] mb-0.5">{sub}</span>}
      </div>
    </div>
  );
}

interface DashboardProps {
  user: User | null;
  idToken: string | null;
  connectors?: Connectors;
  onNavigate?: (screen: ActiveScreen) => void;
  onAsk?: (q: string) => void;
  platformIcon?: PlatformIconFn;
}

interface SourceRow extends MetaEntry {
  id: string;
  connected: boolean;
  count: number;
  syncing: boolean;
  syncStatus?: StatsConnection['initialSyncStatus'];
}

export default function Dashboard({ user, idToken, connectors = {}, onNavigate, onAsk, platformIcon }: DashboardProps) {
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const firstName = (user?.name || 'there').split(' ')[0];
  const hour = new Date().getHours();
  const partOfDay = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Working late';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const loadStats = async () => {
    if (!idToken) { setLoading(false); return; }
    try {
      const res = await fetch('/api/stats', { headers: { Authorization: `Bearer ${idToken}` } });
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.warn('Failed to load stats:', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Poll while anything is actively ingesting so counts climb in real time.
  useEffect(() => {
    loadStats();
    const anyIngesting = (stats?.connections || []).some((c) => c.initialSyncStatus === 'in_progress');
    const interval = setInterval(loadStats, anyIngesting ? 4000 : 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [idToken, (stats?.connections || []).some((c) => c.initialSyncStatus === 'in_progress')]);

  const icon = (id: string, size?: number) => (platformIcon ? platformIcon({ id }, size) : null);

  const liveByProvider = useMemo<Record<string, StatsConnection>>(
    () => Object.fromEntries((stats?.connections || []).map((c) => [c.provider, c])),
    [stats]
  );
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

  const typeSegments = useMemo(
    () => (stats?.byType || [])
      .filter((t) => TYPE_META[t.key])
      .map((t) => ({ key: t.key, n: t.n, ...TYPE_META[t.key] })),
    [stats]
  );
  const total = stats?.total || 0;
  const graphNodes = stats?.graph?.nodes ?? total;
  const graphEdges = stats?.graph?.edges ?? 0;
  const ingested14d = useMemo(() => (stats?.timeline || []).reduce((s, d) => s + d.n, 0), [stats]);
  const anyIngesting = sources.some((s) => s.syncing);
  const recent: RecentItem[] = stats?.recent || [];

  const suggestions = [
    'What changed across my repos this week?',
    'Summarize open work items and their owners',
    'Which pull requests reference Jira tickets?',
  ];
  const submitAsk = (q?: string) => { const t = (q ?? query).trim(); if (t) onAsk?.(t); };

  return (
    <div className="flex-1 overflow-y-auto bg-[#252523] font-geist animate-fade-in">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-8 lg:py-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[30px] lg:text-[34px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">
              {partOfDay}, {firstName}
            </h1>
            <p className="text-[13.5px] font-geist text-[#8C8880] mt-2">
              {dateStr} · {connectedCount} source{connectedCount === 1 ? '' : 's'} connected · {graphNodes} nodes · {graphEdges} edges
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] text-[12px] font-geist font-medium text-[#C7C2BC]">
              {anyIngesting
                ? (<><Loader2 size={13} className="animate-spin text-[#C9A66B]" /> Ingesting</>)
                : (<><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#8FAE97' }} /> All synced</>)}
            </span>
            <button onClick={() => onNavigate?.('integrations')} className="btn-bump btn-bump-dark px-3.5 py-2 text-[12.5px]">
              <Blocks size={15} strokeWidth={1.75} /> Connect sources
            </button>
          </div>
        </div>

        {/* Ask bar */}
        <div className="card-elev rounded-2xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <img src="/particles.png" alt="" className="w-4 h-4 rounded object-contain" />
            <span className="text-[12.5px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Ask hypr across every tool</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2.5 bg-[#1E1D1C] border border-[#3D3A37] rounded-xl px-3.5 py-3 focus-within:border-[#57534E] transition-colors">
              <Search size={16} className="text-[#6B6762] shrink-0" strokeWidth={1.75} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitAsk()}
                placeholder="Ask anything across GitHub, Jira, Slack, Docs…"
                className="flex-1 bg-transparent outline-none font-geist text-[14px] text-[#F4F0EB] placeholder:text-[#6B6762] min-w-0"
              />
            </div>
            <button onClick={() => submitAsk()} disabled={!query.trim()} className="btn-bump btn-bump-accent px-5 py-3 text-[13px]">
              Ask <ArrowRight size={15} strokeWidth={2} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => submitAsk(s)} className="px-3 py-1.5 rounded-lg bg-[#2E2C2A] border border-[#3D3A37] text-[12px] font-geist text-[#C7C2BC] hover:border-[#57534E] hover:text-[#F4F0EB] transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Stat cards — all real */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard label="Graph nodes" value={graphNodes} sub={`${graphEdges} edges`} Icon={Network} />
          <StatCard label="Sources connected" value={connectedCount} sub={`of ${Object.keys(SRC_META).length}`} Icon={Blocks} />
          <StatCard label="Ingested · 14d" value={ingested14d} sub="new nodes" Icon={Activity} />
          <StatCard label="KB documents" value={stats?.documents || 0} sub={`${stats?.knowledgeBases || 0} bases`} Icon={FileText} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          {/* Activity bars */}
          <div className="lg:col-span-2 card-elev rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Ingestion activity</h2>
              <span className="text-[11.5px] font-geist text-[#8C8880]">last 14 days</span>
            </div>
            <p className="text-[11.5px] font-geist text-[#8C8880] mb-4 tabular-nums">{ingested14d} nodes written to the graph</p>
            {loading ? (
              <div className="h-[140px] flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[#57534E]" /></div>
            ) : ingested14d === 0 ? (
              <div className="h-[140px] flex flex-col items-center justify-center text-center gap-1">
                <span className="text-[12.5px] font-geist text-[#8C8880]">No ingestion yet</span>
                <span className="text-[11px] font-geist text-[#6B6762]">Connect a source to start building your graph.</span>
              </div>
            ) : (
              <>
                <Bars data={stats?.timeline || []} />
                <div className="flex items-center justify-between mt-2.5 text-[10.5px] font-geist text-[#6B6762] tabular-nums">
                  <span>{new Date((stats?.timeline || [])[0]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>Today</span>
                </div>
              </>
            )}
          </div>

          {/* Composition donut */}
          <div className="card-elev rounded-2xl p-5">
            <h2 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight mb-4">Graph composition</h2>
            {loading ? (
              <div className="h-[176px] flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[#57534E]" /></div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <Donut segments={typeSegments} total={total} />
                <div className="w-full grid grid-cols-1 gap-1.5">
                  {typeSegments.length === 0 ? (
                    <span className="text-[11.5px] font-geist text-[#6B6762] text-center">No entities yet.</span>
                  ) : typeSegments.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 text-[11.5px] font-geist">
                      <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: s.color }} />
                      <span className="flex-1 text-[#C7C2BC]">{s.label}</span>
                      <span className="text-[#8C8880] tabular-nums">{s.n}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Activity + sources */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Recent ingested entities */}
          <div className="lg:col-span-2 card-elev rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#3D3A37]">
              <h2 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Recent activity</h2>
              {recent.length > 0 && (
                <button onClick={() => onAsk?.('Summarize the most recent activity across my connected tools.')} className="text-[12px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] flex items-center gap-1 transition-colors">
                  Summarize <ArrowUpRight size={13} strokeWidth={1.75} />
                </button>
              )}
            </div>
            {loading ? (
              <div className="py-16 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[#57534E]" /></div>
            ) : recent.length === 0 ? (
              <div className="py-16 flex flex-col items-center text-center gap-1.5 px-5">
                <Network size={26} className="text-[#4A4744] mb-1" strokeWidth={1.5} />
                <p className="text-[13.5px] font-geist text-[#8C8880]">Your graph is empty</p>
                <p className="text-[12px] font-geist text-[#6B6762] max-w-[300px]">Connect GitHub or Jira and hypr will pull issues, PRs and commits into the knowledge graph.</p>
                <button onClick={() => onNavigate?.('integrations')} className="btn-bump btn-bump-accent px-4 py-2 text-[12.5px] mt-3">
                  <Plus size={14} strokeWidth={2} /> Connect a source
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#33302E]">
                {recent.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onAsk?.(`Give me the full context on: ${item.title}`)}
                    className="w-full group flex items-center gap-3.5 px-5 py-3.5 hover:bg-[#2A2826] transition-colors text-left"
                  >
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[#1E1D1C] border border-[#3D3A37]">
                      {icon(item.source, 17)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-geist font-medium text-[#F4F0EB] truncate">{item.title || '(untitled)'}</p>
                      <p className="text-[11.5px] font-geist text-[#8C8880] truncate mt-0.5">
                        {TYPE_META[item.type]?.label || item.type} · {item.repoRef || item.projectRef || SRC_META[item.source]?.label}{fmtAgo(item.updatedAt) ? ` · ${fmtAgo(item.updatedAt)}` : ''}
                      </p>
                    </div>
                    {item.status && (
                      <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-geist font-medium text-[#C7C2BC] shrink-0" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: TYPE_META[item.type]?.color || '#8C8880' }} />
                        {item.status}
                      </span>
                    )}
                    <ArrowUpRight size={15} className="text-[#57534E] group-hover:text-[#F4F0EB] transition-colors shrink-0" strokeWidth={1.75} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-5">
            <div className="card-elev rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Connected sources</h2>
                <span className="text-[11px] font-geist font-medium text-[#8C8880] tabular-nums">{connectedCount}/{Object.keys(SRC_META).length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#1E1D1C] border border-[#3D3A37]">
                      {icon(s.id, 15)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-geist font-medium text-[#F4F0EB] truncate">{s.label}</p>
                      <p className="text-[10.5px] font-geist text-[#8C8880] flex items-center gap-1">
                        {s.syncing && <Loader2 size={9} className="animate-spin text-[#C9A66B]" />}
                        {s.connected
                          ? (s.syncing ? 'Ingesting…' : `${s.count} ${s.count === 1 ? 'node' : 'nodes'}${s.syncStatus === 'error' ? ' · error' : ''}`)
                          : 'Not connected'}
                      </p>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.syncing ? '#C9A66B' : s.connected ? '#8FAE97' : '#57534E' }} />
                  </div>
                ))}
              </div>
              <button onClick={() => onNavigate?.('integrations')} className="btn-bump btn-bump-dark w-full mt-4 py-2.5 text-[12.5px]">
                <Plus size={14} strokeWidth={2} /> Manage integrations
              </button>
            </div>

            <div className="card-elev rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <Database size={15} className="text-[#9C968E]" strokeWidth={1.75} />
                <h2 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Knowledge bases</h2>
              </div>
              <p className="text-[12px] font-geist text-[#8C8880] leading-relaxed mb-4">
                {stats?.documents ? `${stats.documents} document${stats.documents === 1 ? '' : 's'} grounding hypr's answers.` : 'Upload docs to ground hypr\'s answers in your own material.'}
              </p>
              <button onClick={() => onNavigate?.('knowledge')} className="btn-bump btn-bump-accent w-full py-2.5 text-[12.5px]">
                Open knowledge bases <ArrowRight size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
