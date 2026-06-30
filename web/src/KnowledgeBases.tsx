import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Database, Plus, ArrowLeft, FileText, Upload, Trash2, X,
  Loader2, FolderPlus, Search, FileStack, Calendar,
  Blocks, Plug, ArrowUpRight, Check, ChevronDown, Network, Pencil,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Connectors, KbDocument, KbSource, KnowledgeBase, PlatformIconFn } from './types';
import ErrorBoundary from './ErrorBoundary';
import GraphView from './GraphView';

/** Shape sent to the backend when uploading a document. */
type DocInput =
  | { name: string; type: 'text'; content: string }
  | { name: string; type: 'pdf'; contentBase64: string };

type DetailTab = 'documents' | 'sources' | 'insights' | 'graph' | 'mindmap';


const MOCK_PLATFORM_ITEMS: Record<string, {id: string, name: string}[]> = {
  github: [],
  google_drive: [{ id: 'gd-1', name: 'Q3 Roadmaps.pdf' }, { id: 'gd-2', name: 'All Hands Deck.pptx' }, { id: 'gd-3', name: 'Customer Interview Notes.docx' }],
  gdocs: [
    { id: 'doc_1', name: 'Q3 Product Roadmap' },
    { id: 'doc_2', name: 'Engineering Guidelines' },
    { id: 'doc_3', name: 'Architecture RFC' }
  ],
  jira: [
    { id: 'proj_1', name: 'HYPR-Core' },
    { id: 'proj_2', name: 'Web-App' }
  ],
  slack: [
    { id: 'ch_1', name: '#engineering' },
    { id: 'ch_2', name: '#product-updates' },
    { id: 'ch_3', name: '#general' }
  ],
  salesforce: [
    { id: 'sf_1', name: 'Enterprise Accounts' },
    { id: 'sf_2', name: 'Q3 Opportunities' }
  ]
};

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
  const location = useLocation();
  const navigate = useNavigate();

  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith('/kb/')) {
      const id = p.replace('/kb/', '');
      setActiveId(id || null);
    } else {
      setActiveId(null);
    }
  }, [location.pathname]);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<DetailTab>('documents');
  // Bumped whenever the active KB's docs/sources change, to force the embedded
  // graph to rebuild on its own.
  const [graphRefresh, setGraphRefresh] = useState(0);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [sourceSearch, setSourceSearch] = useState('');
  const [tempSelectedItems, setTempSelectedItems] = useState<Record<string, boolean>>({});


  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Dynamic items fetched from external APIs
  const [dynamicItems, setDynamicItems] = useState<Record<string, {id: string, name: string}[]>>({});
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);

  const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
    ...extra,
  });

  const load = async () => {
    if (!idToken) return;
    try {
      const res = await fetch('/api/kb', { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setKbs(data.kbs || []);
      setError('');
    } catch (e) {
      setError((e as Error).message || 'Could not load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Auto-sync: while a knowledge base is open, poll for changes (docs/sources
  // added elsewhere, ingestion catching up) so the graph + mind map + insights
  // evolve on their own. Bumps graphRefresh only when the active base changed.
  const kbsRef = useRef<KnowledgeBase[]>(kbs);
  useEffect(() => { kbsRef.current = kbs; }, [kbs]);
  useEffect(() => {
    if (!activeId || !idToken) return;
    // Removed backend syncing loop to support local-first mock UI
  }, [activeId, idToken]);

  const createKb = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'create', kb: { name: newName.trim(), description: newDesc.trim() } }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setKbs([data.kb, ...kbs]);
      setShowCreate(false);
      setNewName(''); setNewDesc('');
      setActiveId(data.kb.id);
    } catch (e) {
      setError((e as Error).message || 'Failed to create.');
    } finally {
      setCreating(false);
    }
  };

  const deleteKb = async (id: string) => {
    try {
      const res = await fetch(`/api/kb?id=${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      setKbs(kbs.filter((k) => k.id !== id));
      if (activeId === id) setActiveId(null);
    } catch (e) {
      setError((e as Error).message || 'Failed to delete.');
    }
  };

  const renameKb = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'rename', kbId: id, name: newName.trim() }),
      });
      if (res.ok) {
        setKbs(kbs.map((k) => (k.id === id ? { ...k, name: newName.trim(), updatedAt: new Date().toISOString() } : k)));
      }
    } catch (e) {
      console.error('Failed to rename', e);
    }
    setIsEditingName(false);
  };

  const addDoc = async (kbId: string, doc: DocInput) => {
    setUploading(true);
    try {
      const res = await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'add-doc', kbId, doc }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setKbs(kbs.map((k) =>
        k.id === kbId ? { ...k, documents: [...(k.documents || []), data.doc], updatedAt: new Date().toISOString() } : k
      ));
      setGraphRefresh((x) => x + 1);
    } catch (e) {
      setError((e as Error).message || 'Failed to add document.');
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (kbId: string, docId: string) => {
    try {
      const res = await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete-doc', kbId, docId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setKbs(kbs.map((k) =>
        k.id === kbId ? { ...k, documents: (k.documents || []).filter((d) => d.id !== docId), updatedAt: new Date().toISOString() } : k
      ));
      setGraphRefresh((x) => x + 1);
    } catch (e) {
      setError((e as Error).message || 'Failed to delete document.');
    }
  };

  // ── Sources: attach a globally-authorized connector's items to this KB, or
  //    detach it. Both rebuild the KB graph (graphRefresh) on their own. ──────
  const updateSourceItems = async (kbId: string, platform: string, items: KbSource['items']) => {
    try {
      if (items.length === 0) {
        await fetch('/api/kb', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'detach-source', kbId, platform }),
        });
        setKbs(kbs.map((k) =>
          k.id === kbId ? { ...k, sources: (k.sources || []).filter((s) => s.platform !== platform), updatedAt: new Date().toISOString() } : k
        ));
      } else {
        const res = await fetch('/api/kb', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'attach-source', kbId, platform, items }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setKbs(kbs.map((k) =>
          k.id === kbId ? { ...k, sources: [...(k.sources || []).filter((s) => s.platform !== platform), data.source], updatedAt: new Date().toISOString() } : k
        ));
      }
      setGraphRefresh((x) => x + 1);
    } catch (e) {
      console.error('Failed to update source items', e);
    }
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

  const filtered = useMemo(() =>
    kbs.filter((k) => k.name.toLowerCase().includes(search.toLowerCase()) || (k.description && k.description.toLowerCase().includes(search.toLowerCase()))),
    [kbs, search]
  );

  const active = kbs.find((k) => k.id === activeId);

  /* ── Detail view (Single scrollable page) ── */
  if (active) {
    const docs = active.documents || [];
    const kbSources = active.sources || [];
    const attachedPlatforms = new Set(kbSources.map((s) => s.platform));
    const connectedPlatforms = Object.entries(connectors).filter(([, c]) => c?.connected);
    const sourceItemCount = kbSources.reduce((n, s) => n + (s.items?.length || 0), 0);

    const renderSourceIcon = (id: string, size = 18) =>
      platformIcon ? platformIcon({ id }, size) : <Plug size={size - 2} className="text-[#9C968E]" />;

    return (
      <div className="flex-1 flex flex-col h-full min-h-0 bg-[#252523] font-geist animate-fade-in overflow-hidden">
        {/* Header (fixed) */}
        <div className="shrink-0 border-b border-[#3D3A37]">
          <div className="px-6 lg:px-10 py-6">
            <button onClick={() => navigate('/kb')} className="flex items-center gap-2 text-[13px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors mb-5">
              <ArrowLeft size={16} /> Back to Knowledge Bases
            </button>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="w-11 h-11 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center shrink-0">
                  <Database size={20} className="text-[#9C968E]" />
                </span>
                <div className="min-w-0 flex flex-col">
                  {isEditingName ? (
                    <input
                      autoFocus
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameKb(active.id, editNameValue);
                        if (e.key === 'Escape') setIsEditingName(false);
                      }}
                      onBlur={() => renameKb(active.id, editNameValue)}
                      className="bg-[#1E1D1C] border border-[#57534E] rounded-md px-2 py-0.5 text-[20px] font-geist font-semibold text-[#F4F0EB] outline-none max-w-[300px]"
                    />
                  ) : (
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setEditNameValue(active.name); setIsEditingName(true); }}>
                      <h1 className="text-[22px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none truncate">{active.name}</h1>
                      <Pencil size={14} className="text-[#6B6762] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
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
        </div>

        {/* Scrollable single page content */}
        <div className="flex-1 overflow-y-auto pb-32">
          
          {/* Documents Section */}
          <div className="max-w-[1080px] mx-auto px-6 lg:px-10 py-10">
            <h2 className="text-[18px] font-geist font-semibold text-[#F4F0EB] tracking-tight mb-6 flex items-center gap-2"><FileStack size={20} className="text-[#C9A66B]" /> Documents</h2>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Upload */}
              <div className="lg:col-span-2 card-elev rounded-2xl p-5 h-fit">
                <h3 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight mb-4">Upload documents</h3>
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
              {/* Documents List */}
              <div className="lg:col-span-3 card-elev rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#3D3A37]">
                  <h3 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Attached files</h3>
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

          <div className="w-full h-px bg-[#3D3A37]" />

          {/* Sources Section */}
          <div className="max-w-[1080px] mx-auto px-6 lg:px-10 py-10">
            <div className="flex items-center justify-between gap-3 mb-6">
              <h2 className="text-[18px] font-geist font-semibold text-[#F4F0EB] tracking-tight flex items-center gap-2"><Plug size={20} className="text-[#8AA9C9]" /> Connected sources</h2>
              <button onClick={onOpenIntegrations} className="btn-bump btn-bump-dark px-3 py-2 text-[12px]">
                <Blocks size={14} /> Manage integrations
              </button>
            </div>
            
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {connectedPlatforms.map(([id, c]) => {
                  const attachedItems = kbSources.find((s) => s.platform === id)?.items || [];
                  const isExpanded = expandedPlatform === id;
                  const availableItems = (id === 'github' && dynamicItems['github']?.length) ? dynamicItems['github'] : (MOCK_PLATFORM_ITEMS[id] || []);
                  const filteredItems = availableItems.filter(i => i.name.toLowerCase().includes(sourceSearch.toLowerCase()));
                  const isAllFilteredSelected = filteredItems.length > 0 && filteredItems.every(i => tempSelectedItems[i.id]);
                  
                  const handleExpand = async () => {
                    if (isExpanded) {
                      setExpandedPlatform(null);
                    } else {
                      const temp: Record<string, boolean> = {};
                      attachedItems.forEach(i => temp[i.id] = true);
                      setTempSelectedItems(temp);
                      setSourceSearch('');
                      setExpandedPlatform(id);
                      
                      // Fetch from GitHub dynamically if expanded and not loaded
                      if (id === 'github' && !dynamicItems['github']) {
                        setIsFetchingGithub(true);
                        try {
                          const res = await fetch('https://api.github.com/users/swrno/repos?sort=updated&per_page=30');
                          if (res.ok) {
                            const repos = await res.json();
                            setDynamicItems(prev => ({
                              ...prev,
                              github: repos.map((r: any) => ({ id: r.full_name, name: r.full_name }))
                            }));
                          }
                        } catch (e) { console.error('Failed to fetch from GitHub API', e); }
                        setIsFetchingGithub(false);
                      }
                    }
                  };

                  const handleSaveItems = () => {
                    const selectedItems = availableItems.filter(i => tempSelectedItems[i.id]);
                    updateSourceItems(active.id, id, selectedItems);
                    setExpandedPlatform(null);
                  };
                  
                  return (
                    <div key={id} className={`card-elev rounded-2xl overflow-hidden transition-all h-fit ${isExpanded ? 'border-[#57534E]' : ''}`}>
                      <div className="flex items-center gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-[#2A2826] transition-colors" onClick={handleExpand}>
                        <span className="w-10 h-10 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center shrink-0">
                          {renderSourceIcon(id, 18)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-geist font-semibold text-[#F4F0EB]">{PLATFORM_NAMES[id] || id}</span>
                            {attachedItems.length > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-geist font-semibold text-[#8FAE97] bg-[#1E2A22] border border-[#2E4636] px-1.5 py-0.5 rounded-md">
                                <Check size={10} /> Attached
                              </span>
                            )}
                          </div>
                          <p className="text-[11.5px] font-geist text-[#8C8880] mt-0.5 truncate">
                            {attachedItems.length === 0 ? 'Click to select items' : `${attachedItems.length} item(s) attached`}
                          </p>
                        </div>
                        <ChevronDown size={18} className={`text-[#6B6762] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                      
                      {/* Show attached items as chips when not expanded */}
                      {!isExpanded && attachedItems.length > 0 && (
                        <div className="px-4 pb-3.5 pt-0 flex flex-wrap gap-2">
                          {attachedItems.map(item => (
                            <span key={item.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#1E1D1C] border border-[#3D3A37] rounded-md text-[11px] font-geist text-[#C7C2BC]">
                              {item.name}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {isExpanded && (
                        <div className="border-t border-[#3D3A37] bg-[#1E1D1C]">
                          <div className="p-3 border-b border-[#3D3A37]">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6762]" />
                              <input 
                                type="text"
                                placeholder={`Search ${PLATFORM_NAMES[id] || id}...`}
                                value={sourceSearch}
                                onChange={(e) => setSourceSearch(e.target.value)}
                                className="w-full bg-[#252523] border border-[#3D3A37] rounded-lg pl-9 pr-3 py-2 text-[13px] font-geist text-[#F4F0EB] placeholder:text-[#6B6762] focus:border-[#57534E] outline-none transition-colors"
                              />
                            </div>
                          </div>
                          
                          <div className="max-h-[240px] overflow-y-auto p-2">
                            {filteredItems.length === 0 ? (
                              <div className="py-6 text-center text-[12px] font-geist text-[#8C8880]">
                                No items found
                              </div>
                            ) : isFetchingGithub && id === 'github' ? (
                              <div className="py-6 flex flex-col items-center justify-center text-[12px] font-geist text-[#8C8880]">
                                <Loader2 size={16} className="animate-spin mb-2 opacity-50" />
                                Fetching your repositories directly from GitHub...
                              </div>
                            ) : (
                              <>
                                <button 
                                  onClick={() => {
                                    const next = { ...tempSelectedItems };
                                    const shouldSelect = !isAllFilteredSelected;
                                    filteredItems.forEach(i => next[i.id] = shouldSelect);
                                    setTempSelectedItems(next);
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#2A2826] transition-colors mb-1 group"
                                >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isAllFilteredSelected ? 'bg-[#C9A66B] border-[#C9A66B]' : 'border-[#4A4744] group-hover:border-[#6B6762]'}`}>
                                    {isAllFilteredSelected && <Check size={12} className="text-[#1A1917]" />}
                                  </div>
                                  <span className="text-[12.5px] font-geist font-medium text-[#C7C2BC]">
                                    {isAllFilteredSelected ? 'Deselect all' : 'Select all'}
                                  </span>
                                </button>
                                
                                {filteredItems.map(item => (
                                  <button 
                                    key={item.id}
                                    onClick={() => setTempSelectedItems(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#2A2826] transition-colors group"
                                  >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${tempSelectedItems[item.id] ? 'bg-[#C9A66B] border-[#C9A66B]' : 'border-[#4A4744] group-hover:border-[#6B6762]'}`}>
                                      {tempSelectedItems[item.id] && <Check size={12} className="text-[#1A1917]" />}
                                    </div>
                                    <div className="flex-1 min-w-0 text-left">
                                      <p className="text-[13px] font-geist text-[#F4F0EB] truncate">{item.name}</p>
                                    </div>
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                          
                          <div className="p-3 border-t border-[#3D3A37] flex items-center justify-end gap-2 bg-[#252523]">
                            <button onClick={() => setExpandedPlatform(null)} className="px-3 py-1.5 text-[12px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors">
                              Cancel
                            </button>
                            <button onClick={handleSaveItems} className="btn-bump btn-bump-accent px-4 py-1.5 text-[12px]">
                              Save selection
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="w-full h-px bg-[#3D3A37] my-10" />

          {/* Graph Section */}
          <div className="max-w-[1080px] mx-auto px-6 lg:px-10 pb-10">
            <div className="flex items-center justify-between gap-3 mb-6">
              <h2 className="text-[18px] font-geist font-semibold text-[#F4F0EB] tracking-tight flex items-center gap-2">
                <Network size={20} className="text-[#C9A66B]" /> Cognee Graph
              </h2>
            </div>
            <div className="card-elev rounded-2xl overflow-hidden h-[500px] relative border border-[#3D3A37]">
              <GraphView idToken={idToken} kbId={active.id} embedded={true} refreshKey={graphRefresh} />
            </div>
          </div>

        </div>
      </div>
    );
  }

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
            {filtered.map((kb: KnowledgeBase) => {
              const n = (kb.documents || []).length;
              return (
                <button key={kb.id} onClick={() => navigate(`/kb/${kb.id}`)}
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
