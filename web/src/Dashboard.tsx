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
const COMING_SOON = ['slack', 'salesforce'];

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
  kbsCount?: number;
}

interface SourceRow extends MetaEntry {
  id: string;
  connected: boolean;
  count: number;
  syncing: boolean;
  syncStatus?: StatsConnection['initialSyncStatus'];
}

export default function Dashboard({ user, idToken, connectors = {}, onNavigate, onAsk, platformIcon, kbsCount = 0 }: DashboardProps) {
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const firstName = (user?.name || 'there').split(' ')[0];
  const hour = new Date().getHours();
  const partOfDay = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Working late';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const loadStats = async () => {
    setLoading(true);
    setTimeout(() => {
      setStats({
        total: 1240,
        documents: 42,
        knowledgeBases: 3,
        connections: [],
        bySource: [{ key: 'github', n: 12 }, { key: 'gdocs', n: 4 }],
        byType: [{ key: 'Document', n: 20 }, { key: 'Code', n: 85 }],
        timeline: [],
        graph: { nodes: 1540, edges: 3200 },
        recent: []
      });
      setLoading(false);
    }, 400);
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

  // Read local counts for apps
  const appsCount = (() => { try { return JSON.parse(localStorage.getItem('hs_apps') || '[]').length; } catch { return 0; } })();

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
              {dateStr} · {connectedCount} source{connectedCount === 1 ? '' : 's'} connected
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={() => onNavigate?.('integrations')} className="btn-bump btn-bump-dark px-3.5 py-2 text-[12.5px]">
              <Blocks size={15} strokeWidth={1.75} /> Connect sources
            </button>
          </div>
        </div>

        {/* Stat cards — Applications | Knowledge Bases */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          <button onClick={() => onNavigate?.('applications')} className="text-left group card-elev rounded-2xl p-6 flex flex-col gap-3 hover:bg-[#2A2826] transition-colors border border-transparent hover:border-[#3D3A37]">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-geist font-semibold text-[#8C8880] tracking-tight group-hover:text-[#F4F0EB] transition-colors">Applications</span>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#1E1D1C] border border-[#3D3A37]">
                <Activity size={18} className="text-[#9C968E]" strokeWidth={1.75} />
              </span>
            </div>
            <div className="flex items-end justify-between">
              <span className="font-geist font-semibold text-[#F4F0EB] text-[42px] leading-none tracking-tight tabular-nums">{appsCount}</span>
              <span className="text-[12px] font-geist font-medium text-[#8C8880] mb-1 flex items-center gap-1 group-hover:text-[#C9A66B] transition-colors">View apps <ArrowRight size={14} /></span>
            </div>
          </button>

          <button onClick={() => onNavigate?.('knowledge')} className="text-left group card-elev rounded-2xl p-6 flex flex-col gap-3 hover:bg-[#2A2826] transition-colors border border-transparent hover:border-[#3D3A37]">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-geist font-semibold text-[#8C8880] tracking-tight group-hover:text-[#F4F0EB] transition-colors">Knowledge Bases</span>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#1E1D1C] border border-[#3D3A37]">
                <Database size={18} className="text-[#9C968E]" strokeWidth={1.75} />
              </span>
            </div>
            <div className="flex items-end justify-between">
              <span className="font-geist font-semibold text-[#F4F0EB] text-[42px] leading-none tracking-tight tabular-nums">{kbsCount}</span>
              <span className="text-[12px] font-geist font-medium text-[#8C8880] mb-1 flex items-center gap-1 group-hover:text-[#C9A66B] transition-colors">View bases <ArrowRight size={14} /></span>
            </div>
          </button>
        </div>

        {/* Connected sources */}
        <div className="card-elev rounded-2xl p-6 max-w-[600px]">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[16px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Connected sources</h2>
            <span className="text-[12px] font-geist font-medium text-[#8C8880] tabular-nums">{connectedCount}/{Object.keys(SRC_META).length}</span>
          </div>
          <div className="flex flex-col gap-3">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center gap-4 py-1">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#1E1D1C] border border-[#3D3A37]">
                  {icon(s.id, 18)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-geist font-medium text-[#F4F0EB] truncate">{s.label}</p>
                  <p className="text-[12px] font-geist text-[#8C8880] mt-0.5">
                    {s.connected ? 'Connected and authorized' : 'Not connected'}
                  </p>
                </div>
                {s.connected ? (
                   <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-geist font-medium text-[#8FAE97] bg-[#1E2A22] border border-[#2E4636] shrink-0">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#8FAE97]" /> Active
                   </span>
                ) : COMING_SOON.includes(s.id) ? (
                   <span className="text-[10px] font-geist font-semibold text-[#C9A66B] bg-[#2A2318] border border-[#5A4A28] px-2 py-1 rounded-md uppercase tracking-wide shrink-0">Coming Soon</span>
                ) : (
                   <button onClick={() => onNavigate?.('integrations')} className="bg-[#F4F0EB] hover:bg-[#EAE5DF] text-[#1E1D1C] px-3.5 py-1.5 rounded-md text-[11.5px] font-semibold transition-colors shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.2)]">Connect</button>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => onNavigate?.('integrations')} className="btn-bump btn-bump-dark w-full mt-6 py-3 text-[13px]">
            <Plus size={15} strokeWidth={2} /> Manage integrations
          </button>
        </div>

      </div>
    </div>
  );
}
