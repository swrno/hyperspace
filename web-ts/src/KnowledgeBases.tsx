import { useEffect, useRef, useState } from 'react';
import {
  Database, Plus, ArrowLeft, FileText, Upload, Trash2, X,
  Loader2, FolderPlus, Search, FileStack, Calendar,
} from 'lucide-react';
import type { KbDocument, KnowledgeBase } from './types';

/** Shape sent to the backend when uploading a document. */
type DocInput =
  | { name: string; type: 'text'; content: string }
  | { name: string; type: 'pdf'; contentBase64: string };

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
}

export default function KnowledgeBases({ idToken }: KnowledgeBasesProps) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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
    try {
      await fetch('/api/kb', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete-doc', kbId, docId }),
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

  /* ── Detail view ─────────────────────────────────────────────── */
  if (active) {
    const docs: KbDocument[] = active.documents || [];
    return (
      <div className="flex-1 overflow-y-auto bg-[#252523] font-geist animate-fade-in">
        <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-8 lg:py-10">
          <button onClick={() => setActiveId(null)} className="flex items-center gap-2 text-[13px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors mb-6">
            <ArrowLeft size={16} /> Back to Knowledge Bases
          </button>

          <div className="flex items-start justify-between gap-4 mb-8">
            <div className="flex items-center gap-3.5">
              <span className="w-12 h-12 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center shrink-0">
                <Database size={22} className="text-[#9C968E]" />
              </span>
              <div>
                <h1 className="text-[26px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">{active.name}</h1>
                <p className="text-[13px] font-geist text-[#8C8880] mt-1.5">{active.description || 'No description'} · {docs.length} document{docs.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            <button onClick={() => deleteKb(active.id)} className="btn-bump btn-bump-dark px-3 py-2 text-[12px]">
              <Trash2 size={14} /> Delete
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
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
                <button key={kb.id} onClick={() => setActiveId(kb.id)}
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
