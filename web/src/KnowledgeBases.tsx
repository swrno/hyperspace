import { useEffect, useRef, useState } from 'react';
import {
  Database, Plus, ArrowLeft, FileText, Upload, Trash2, X,
  Loader2, FolderPlus, Search, FileStack, Calendar,
  Network, GitBranch, Blocks, Plug, ArrowUpRight, Check, BarChart3,
} from 'lucide-react';
import type { Connectors, KbDocument, KbSource, KnowledgeBase, PlatformIconFn } from './types';
import ErrorBoundary from './ErrorBoundary';
import GraphView from './GraphView';
import MindMap from './MindMap';
import KbInsights from './KbInsights';

/** Shape sent to the backend when uploading a document. */
type DocInput =
  | { name: string; type: 'text'; content: string }
  | { name: string; type: 'pdf'; contentBase64: string };

type DetailTab = 'documents' | 'sources' | 'insights' | 'graph' | 'mindmap';

const PLATFORM_NAMES: Record<string, string> = {
  github: 'GitHub', gdocs: 'Google Docs', gslides: 'Google Slides', gsheets: 'Google Sheets',
  gcal: 'Google Calendar', jira: 'Jira', slack: 'Slack', salesforce: 'Salesforce',
};
const platformNoun = (id: string) => (id === 'github' ? 'repositories' : id === 'jira' ? 'projects' : id === 'slack' ? 'channels' : 'items');

const fmtBytes = (n?: number): string => {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtDate = (iso?: string): string => {
  try { return new Date(iso as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
};

interface KnowledgeBasesProps {
  idToken: string | null;
  onAsk?: (q: string) => void;
  /** Globally-authorized connectors (from Integrations) available to attach. */
  connectors?: Connectors;
  /** Brand-icon renderer passed down from the shell. */
  platformIcon?: PlatformIconFn;
  /** Jump to the Integrations screen to authorize more sources. */
  onOpenIntegrations?: () => void;
}

export default function KnowledgeBases({ idToken, onAsk, connectors = {}, platformIcon, onOpenIntegrations }: KnowledgeBasesProps) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<DetailTab>('documents');
  // Bumped whenever the active KB's docs/sources change, to force the embedded
  // graph to rebuild on its own.
  const [graphRefresh, setGraphRefresh] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
    ...extra,
  });

  const load = async () => {
    if (!idToken) { setLoading(false); return; }
    try {
      const res = await fetch('/api/kb', { headers: { Authorization: `Bearer ${idToken}` } });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setKbs(data.kbs || []);
      setError('');
    } catch (e) {
      setError((e as Error).message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [idToken]);

  // Auto-sync: while a knowledge base is open, poll for changes (docs/sources
  // added elsewhere, ingestion catching up) so the graph + mind map + insights
  // evolve on their own. Bumps graphRefresh only when the active base changed.
  const kbsRef = useRef<KnowledgeBase[]>(kbs);
  useEffect(() => { kbsRef.current = kbs; }, [kbs]);
  useEffect(() => {
    if (!activeId || !idToken) return;
    const fingerprint = (k?: KnowledgeBase) => JSON.stringify({ d: k?.documents?.map((x) => x.id), s: k?.sources?.map((x) => `${x.platform}:${x.items?.length}`) });
    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch('/api/kb', { headers: { Authorization: `Bearer ${idToken}` } });
        if (!res.ok) return;
        const next: KnowledgeBase[] = (await res.json()).kbs || [];
        const before = kbsRef.current.find((k) => k.id === activeId);
        const after = next.find((k) => k.id === activeId);
        if (after && fingerprint(before) !== fingerprint(after)) setGraphRefresh((x) => x + 1);
        setKbs(next);
      } catch { /* ignore */ }
    };
    const id = setInterval(tick, 12000);
    return () => clearInterval(id);
  }, [activeId, idToken]);

  const createKb = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'create', kb: { name: newName, description: newDesc } }),
      });
      const data = await res.json();
      if (data.kb) setKbs((prev) => [data.kb, ...prev]);
      setShowCreate(false);
      setNewName(''); setNewDesc('');
      if (data.id) setActiveId(data.id);
    } catch (e) {
      setError((e as Error).message || 'Failed to create.');
    } finally {
      setCreating(false);
    }
  };

  const deleteKb = async (id: string) => {
    setKbs((prev) => prev.filter((k) => k.id !== id));
    if (activeId === id) setActiveId(null);
    try { await fetch(`/api/kb?id=${id}`, { method: 'DELETE', headers: authHeaders() }); }
    catch { /* ignore */ }
  };

  const addDoc = async (kbId: string, doc: DocInput) => {
    setUploading(true);
    try {
      const res = await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'add-doc', kbId, doc }),
      });
      const data = await res.json();
      if (data.doc) {
        setKbs((prev) => prev.map((k) =>
          k.id === kbId ? { ...k, documents: [...(k.documents || []), data.doc] } : k
        ));
        setGraphRefresh((x) => x + 1);
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to add document.');
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (kbId: string, docId: string) => {
    setKbs((prev) => prev.map((k) =>
      k.id === kbId ? { ...k, documents: (k.documents || []).filter((d) => d.id !== docId) } : k
    ));
    setGraphRefresh((x) => x + 1);
    try {
      await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete-doc', kbId, docId }),
      });
    } catch { /* ignore */ }
  };

  // ── Sources: attach a globally-authorized connector's items to this KB, or
  //    detach it. Both rebuild the KB graph (graphRefresh) on their own. ──────
  const attachSource = async (kbId: string, platform: string, items: KbSource['items']) => {
    const source: KbSource = { platform, items, attachedAt: new Date().toISOString() };
    setKbs((prev) => prev.map((k) =>
      k.id === kbId ? { ...k, sources: [...(k.sources || []).filter((s) => s.platform !== platform), source] } : k
    ));
    setGraphRefresh((x) => x + 1);
    try {
      await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'attach-source', kbId, platform, items }),
      });
    } catch { /* ignore */ }
  };

  const detachSource = async (kbId: string, platform: string) => {
    setKbs((prev) => prev.map((k) =>
      k.id === kbId ? { ...k, sources: (k.sources || []).filter((s) => s.platform !== platform) } : k
    ));
    setGraphRefresh((x) => x + 1);
    try {
      await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'detach-source', kbId, platform }),
      });
    } catch { /* ignore */ }
  };

  const readAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file); // data:<mime>;base64,<...>
    });

  const onFiles = async (kbId: string, fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      const isText = /\.(txt|md|markdown|json|csv|log)$/i.test(file.name) || file.type.startsWith('text');
      if (isText) {
        let content = '';
        try { content = await file.text(); } catch { content = ''; }
        await addDoc(kbId, { name: file.name, type: 'text', content });
      } else {
        // PDFs / binaries: ship the bytes so the server can extract the text.
        let contentBase64 = '';
        try { contentBase64 = await readAsBase64(file); } catch { contentBase64 = ''; }
        await addDoc(kbId, { name: file.name, type: 'pdf', contentBase64 });
      }
    }
  };

  const active = kbs.find((k) => k.id === activeId);

  /* ── Detail view (tabbed hub: Documents · Sources · Graph · Mind Map) ── */
  if (active) {
    const docs: KbDocument[] = active.documents || [];
    const kbSources: KbSource[] = active.sources || [];
    const attachedPlatforms = new Set(kbSources.map((s) => s.platform));
    const connectedPlatforms = Object.entries(connectors).filter(([, c]) => c?.connected);
    const sourceItemCount = kbSources.reduce((n, s) => n + (s.items?.length || 0), 0);

    const detailTabs: { id: DetailTab; label: string; Icon: typeof FileStack; badge?: number }[] = [
      { id: 'documents', label: 'Documents', Icon: FileStack, badge: docs.length },
      { id: 'sources', label: 'Sources', Icon: Plug, badge: kbSources.length },
      { id: 'insights', label: 'Insights', Icon: BarChart3 },
      { id: 'graph', label: 'Knowledge Graph', Icon: Network },
      { id: 'mindmap', label: 'Mind Map', Icon: GitBranch },
    ];

    const renderSourceIcon = (id: string, size = 18) =>
      platformIcon ? platformIcon({ id }, size) : <Plug size={size - 2} className="text-[#9C968E]" />;

    return (
      <div className="flex-1 flex flex-col h-full min-h-0 bg-[#252523] font-geist animate-fade-in overflow-hidden">
        {/* Header + tabs (fixed) */}
        <div className="shrink-0 border-b border-[#3D3A37]">
          <div className="px-6 lg:px-10 pt-6">
            <button onClick={() => setActiveId(null)} className="flex items-center gap-2 text-[13px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors mb-5">
              <ArrowLeft size={16} /> Back to Knowledge Bases
            </button>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="w-11 h-11 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center shrink-0">
                  <Database size={20} className="text-[#9C968E]" />
                </span>
                <div className="min-w-0">
                  <h1 className="text-[22px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none truncate">{active.name}</h1>
                  <p className="text-[12.5px] font-geist text-[#8C8880] mt-1.5 truncate">
                    {active.description || 'No description'} · {docs.length} doc{docs.length === 1 ? '' : 's'} · {kbSources.length} source{kbSources.length === 1 ? '' : 's'}{sourceItemCount ? ` · ${sourceItemCount} item${sourceItemCount === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => deleteKb(active.id)} className="btn-bump btn-bump-dark px-3 py-2 text-[12px] shrink-0">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
          <div className="px-4 lg:px-8 mt-4 flex items-center gap-1 overflow-x-auto">
            {detailTabs.map(({ id, label, Icon, badge }) => {
              const on = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-geist font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${on ? 'border-[#C9A66B] text-[#F4F0EB]' : 'border-transparent text-[#8C8880] hover:text-[#F4F0EB]'}`}>
                  <Icon size={15} className={on ? 'text-[#C9A66B]' : ''} /> {label}
                  {badge ? <span className="text-[10.5px] font-semibold tabular-nums text-[#C7C2BC] bg-[#1E1D1C] border border-[#3D3A37] px-1.5 py-0.5 rounded-md">{badge}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content (fills remaining height) */}
        <div className="flex-1 min-h-0">
          {tab === 'documents' && (
            <div className="h-full overflow-y-auto">
              <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-7 grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Upload */}
                <div className="lg:col-span-2 card-elev rounded-2xl p-5 h-fit">
                  <h2 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight mb-4">Upload documents</h2>
                  <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md,.markdown,.json,.csv" className="hidden"
                    onChange={(e) => { onFiles(active.id, e.target.files); e.target.value = ''; }} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full border border-dashed border-[#4A4744] hover:border-[#57534E] rounded-xl py-9 flex flex-col items-center justify-center gap-2.5 transition-colors hover:bg-[#2A2826] disabled:opacity-60"
                  >
                    {uploading ? <Loader2 size={26} className="text-[#8C8880] animate-spin" /> : <Upload size={26} className="text-[#8C8880]" />}
                    <span className="text-[14px] font-geist font-medium text-[#F4F0EB]">{uploading ? 'Uploading…' : 'Click to upload'}</span>
                    <span className="text-[11.5px] font-geist text-[#6B6762]">PDF, TXT, or Markdown files</span>
                  </button>
                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <div className="bg-[#1E1D1C] border border-[#3D3A37] rounded-xl py-3 text-center">
                      <p className="text-[22px] font-geist font-semibold text-[#F4F0EB] tabular-nums leading-none">{docs.length}</p>
                      <p className="text-[10.5px] font-geist text-[#8C8880] mt-1.5">Total files</p>
                    </div>
                    <div className="bg-[#1E1D1C] border border-[#3D3A37] rounded-xl py-3 text-center">
                      <p className="text-[22px] font-geist font-semibold text-[#8FAE97] tabular-nums leading-none">{docs.filter((d) => d.status === 'ready').length}</p>
                      <p className="text-[10.5px] font-geist text-[#8C8880] mt-1.5">Ready</p>
                    </div>
                  </div>
                </div>
                {/* Documents */}
                <div className="lg:col-span-3 card-elev rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#3D3A37]">
                    <h2 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Documents</h2>
                    <span className="text-[11.5px] font-geist text-[#8C8880] tabular-nums">{docs.length} file{docs.length === 1 ? '' : 's'}</span>
                  </div>
                  {docs.length === 0 ? (
                    <div className="px-5 py-14 flex flex-col items-center text-center">
                      <FileStack size={30} className="text-[#4A4744] mb-3" />
                      <p className="text-[13.5px] font-geist text-[#8C8880]">No documents yet. Upload a file to get started.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#33302E]">
                      {docs.map((d) => (
                        <div key={d.id} className="group flex items-center gap-3.5 px-5 py-3.5 hover:bg-[#2A2826] transition-colors">
                          <span className="w-9 h-9 rounded-lg bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center shrink-0">
                            <FileText size={16} className="text-[#9C968E]" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-geist font-medium text-[#F4F0EB] truncate">{d.name}</p>
                            <p className="text-[11px] font-geist text-[#8C8880] mt-0.5">{fmtBytes(d.size)} · {fmtDate(d.createdAt)}</p>
                          </div>
                          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-geist font-medium text-[#C7C2BC] shrink-0" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#8FAE97' }} /> Ready
                          </span>
                          <button onClick={() => deleteDoc(active.id, d.id)} className="p-1.5 rounded-md text-[#57534E] hover:text-[#F87171] hover:bg-[#33302E] opacity-0 group-hover:opacity-100 transition-all shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'sources' && (
            <div className="h-full overflow-y-auto">
              <div className="max-w-[820px] mx-auto px-6 lg:px-10 py-7">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h2 className="text-[16px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Connected sources</h2>
                  <button onClick={onOpenIntegrations} className="btn-bump btn-bump-dark px-3 py-2 text-[12px]">
                    <Blocks size={14} /> Manage integrations
                  </button>
                </div>
                <p className="text-[12.5px] font-geist text-[#8C8880] mb-5">Attach authorized sources so this base's graph and mind map are built from them. Detaching rebuilds the graph automatically.</p>

                {connectedPlatforms.length === 0 ? (
                  <div className="card-elev rounded-2xl py-14 flex flex-col items-center text-center">
                    <span className="w-14 h-14 rounded-2xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center mb-4">
                      <Plug size={24} className="text-[#9C968E]" />
                    </span>
                    <h3 className="text-[15px] font-geist font-semibold text-[#F4F0EB]">No sources authorized yet</h3>
                    <p className="text-[12.5px] font-geist text-[#8C8880] mt-1.5 mb-5 max-w-[360px]">Authorize GitHub, Google Docs, Jira and more in Integrations, then attach them to this knowledge base.</p>
                    <button onClick={onOpenIntegrations} className="btn-bump btn-bump-accent px-4 py-2.5 text-[13px]">
                      <ArrowUpRight size={15} /> Open Integrations
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {connectedPlatforms.map(([id, c]) => {
                      const attached = attachedPlatforms.has(id);
                      const items = (c?.selectedItems || []).map((i) => ({ id: i.id, name: i.name, meta: i.meta }));
                      const attachedItems = kbSources.find((s) => s.platform === id)?.items || [];
                      return (
                        <div key={id} className="card-elev rounded-2xl overflow-hidden">
                          <div className="flex items-center gap-3.5 px-4 py-3.5">
                            <span className="w-10 h-10 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center shrink-0">
                              {renderSourceIcon(id, 18)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[14px] font-geist font-semibold text-[#F4F0EB]">{PLATFORM_NAMES[id] || id}</span>
                                {attached && (
                                  <span className="flex items-center gap-1 text-[10px] font-geist font-semibold text-[#8FAE97] bg-[#1E2A22] border border-[#2E4636] px-1.5 py-0.5 rounded-md">
                                    <Check size={10} /> Attached
                                  </span>
                                )}
                              </div>
                              <p className="text-[11.5px] font-geist text-[#8C8880] mt-0.5 truncate">
                                {items.length} {platformNoun(id)} synced{attached ? ` · ${attachedItems.length} in this base` : ''}
                              </p>
                            </div>
                            {attached ? (
                              <button onClick={() => detachSource(active.id, id)} className="text-[12px] font-geist font-medium px-3 py-2 rounded-lg text-[#BFA39C] hover:text-[#C28379] hover:bg-[rgba(194,131,121,0.08)] transition-colors shrink-0">
                                Detach
                              </button>
                            ) : (
                              <button onClick={() => attachSource(active.id, id, items)} disabled={!items.length} className="btn-bump btn-bump-accent px-3.5 py-2 text-[12px] shrink-0 disabled:opacity-50">
                                <Plus size={14} /> Attach
                              </button>
                            )}
                          </div>
                          {attached && attachedItems.length > 0 && (
                            <div className="border-t border-[#33302E] px-4 py-2.5 flex flex-wrap gap-1.5">
                              {attachedItems.slice(0, 12).map((it) => (
                                <span key={it.id} className="text-[11px] font-geist text-[#C7C2BC] bg-[#1E1D1C] border border-[#33302E] rounded-md px-2 py-1 truncate max-w-[220px]">{it.name}</span>
                              ))}
                              {attachedItems.length > 12 && <span className="text-[11px] font-geist text-[#6B6762] px-2 py-1">+{attachedItems.length - 12} more</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'insights' && (
            <ErrorBoundary label="this knowledge base's insights">
              <KbInsights idToken={idToken} kb={active} refreshKey={graphRefresh} />
            </ErrorBoundary>
          )}

          {tab === 'graph' && (
            <ErrorBoundary label="this knowledge base's graph">
              <GraphView idToken={idToken} kbId={active.id} embedded refreshKey={graphRefresh} onAsk={onAsk} />
            </ErrorBoundary>
          )}

          {tab === 'mindmap' && (
            <ErrorBoundary label="this knowledge base's mind map">
              <MindMap kb={active} />
            </ErrorBoundary>
          )}
        </div>
      </div>
    );
  }

  /* ── List view ───────────────────────────────────────────────── */
  const filtered = kbs.filter((k) => k.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 overflow-y-auto bg-[#252523] font-geist animate-fade-in">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-8 lg:py-10">

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
          <div>
            <h1 className="text-[30px] lg:text-[34px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">Knowledge Bases</h1>
            <p className="text-[13.5px] font-geist text-[#8C8880] mt-2">Ground hypr's answers in your own documents and resources.</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-bump btn-bump-accent px-4 py-2.5 text-[13px]">
            <Plus size={16} /> Create Knowledge Base
          </button>
        </div>

        <div className="flex items-center gap-2.5 bg-[#1E1D1C] border border-[#3D3A37] rounded-xl px-3.5 py-2.5 mb-6 max-w-[420px] focus-within:border-[#57534E] transition-colors">
          <Search size={16} className="text-[#6B6762] shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search knowledge bases…"
            className="flex-1 bg-transparent outline-none font-geist text-[13.5px] text-[#F4F0EB] placeholder:text-[#6B6762] min-w-0" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-[#8C8880]"><Loader2 size={22} className="animate-spin" /></div>
        ) : error ? (
          <div className="card-elev rounded-2xl p-6 text-[13px] font-geist text-[#F87171]">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="card-elev rounded-2xl py-16 flex flex-col items-center text-center">
            <span className="w-14 h-14 rounded-2xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center mb-4">
              <FolderPlus size={26} className="text-[#9C968E]" />
            </span>
            <h3 className="text-[16px] font-geist font-semibold text-[#F4F0EB]">{search ? 'No matches' : 'No knowledge bases yet'}</h3>
            <p className="text-[13px] font-geist text-[#8C8880] mt-1.5 mb-5 max-w-[340px]">{search ? 'Try a different search.' : 'Create your first knowledge base and upload documents to ground answers.'}</p>
            {!search && (
              <button onClick={() => setShowCreate(true)} className="btn-bump btn-bump-accent px-4 py-2.5 text-[13px]">
                <Plus size={16} /> Create Knowledge Base
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((kb) => {
              const n = (kb.documents || []).length;
              return (
                <button key={kb.id} onClick={() => { setActiveId(kb.id); setTab('documents'); }}
                  className="card-elev card-elev-hover rounded-2xl p-5 text-left flex flex-col gap-4 group">
                  <div className="flex items-start justify-between">
                    <span className="w-11 h-11 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center">
                      <Database size={20} className="text-[#9C968E]" />
                    </span>
                    <span className="text-[11px] font-geist font-semibold text-[#C7C2BC] bg-[#1E1D1C] border border-[#3D3A37] px-2 py-1 rounded-md tabular-nums">
                      {n} doc{n === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[16px] font-geist font-semibold text-[#F4F0EB] tracking-tight truncate">{kb.name}</h3>
                    <p className="text-[12.5px] font-geist text-[#8C8880] mt-1 line-clamp-2 min-h-[18px]">{kb.description || 'No description'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-geist text-[#6B6762] pt-3 border-t border-[#33302E]">
                    <Calendar size={12} /> Created {fmtDate(kb.createdAt)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-[460px] card-elev rounded-2xl p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-geist font-semibold text-[#F4F0EB] tracking-tight">New Knowledge Base</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-md text-[#8C8880] hover:text-[#F4F0EB] hover:bg-[#33302E] transition-colors"><X size={18} /></button>
            </div>
            <label className="block text-[11px] font-geist font-semibold uppercase tracking-wider text-[#8C8880] mb-1.5">Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createKb()}
              placeholder="e.g. Engineering Wiki"
              className="w-full bg-[#1E1D1C] border border-[#3D3A37] rounded-lg px-3.5 py-2.5 text-[14px] font-geist text-[#F4F0EB] placeholder:text-[#6B6762] outline-none focus:border-[#57534E] transition-colors mb-4" />
            <label className="block text-[11px] font-geist font-semibold uppercase tracking-wider text-[#8C8880] mb-1.5">Description <span className="text-[#57534E] normal-case font-normal">(optional)</span></label>
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3}
              placeholder="What lives in this knowledge base?"
              className="w-full bg-[#1E1D1C] border border-[#3D3A37] rounded-lg px-3.5 py-2.5 text-[14px] font-geist text-[#F4F0EB] placeholder:text-[#6B6762] outline-none focus:border-[#57534E] transition-colors resize-none mb-5" />
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-[13px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors">Cancel</button>
              <button onClick={createKb} disabled={!newName.trim() || creating} className="btn-bump btn-bump-accent px-5 py-2.5 text-[13px]">
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
