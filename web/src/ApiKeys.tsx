import { useEffect, useState } from 'react';
import { Key, Plus, Copy, Check, Trash2, X, TriangleAlert } from 'lucide-react';

/**
 * API Keys — frontend-only key management (no backend).
 *
 * Mirrors how real key products behave: the full secret is shown exactly once,
 * right after creation ("copy it now — you won't see it again"). After that we
 * keep only a masked preview (prefix + last 4); the full key is never stored or
 * revealable again. Persisted to localStorage so the area is fully usable.
 */

interface ApiKey {
  id: string;
  name: string;
  preview: string; // masked, e.g. sk_live_1a2b••••••••cd34
  createdAt: string;
  expiresAt: string | null; // ISO date, or null for no expiration
}

const STORAGE_KEY = 'hs_api_keys';

const genKey = () =>
  'sk_live_' +
  Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const maskKey = (k: string) => `${k.slice(0, 11)}${'•'.repeat(14)}${k.slice(-4)}`;

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
};

const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
  { label: 'No expiration', days: null },
];

const expiryInfo = (iso: string | null): { text: string; expired: boolean } => {
  if (!iso) return { text: 'Never', expired: false };
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { text: '—', expired: false };
  if (t < Date.now()) return { text: 'Expired', expired: true };
  return { text: fmtDate(iso), expired: false };
};

// Load + migrate any older records (which stored the full `key`) to masked previews.
const loadKeys = (): ApiKey[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return (Array.isArray(raw) ? raw : []).map((k: any) => ({
      id: k.id,
      name: k.name,
      createdAt: k.createdAt,
      preview: k.preview || (k.key ? maskKey(k.key) : 'sk_live_••••••••••••'),
      expiresAt: k.expiresAt ?? null,
    }));
  } catch { return []; }
};

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>(loadKeys);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); } catch { /* ignore */ }
  }, [keys]);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExpiryDays, setNewExpiryDays] = useState<number | null>(30);
  // The just-generated full key, shown once. Closing the dialog discards it.
  const [revealKey, setRevealKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const openCreate = () => { setNewName(''); setNewExpiryDays(30); setRevealKey(null); setShowCreate(true); };
  const closeModal = () => { setShowCreate(false); setRevealKey(null); setCopied(false); };

  const createKey = () => {
    const name = newName.trim() || 'Untitled key';
    const key = genKey();
    const expiresAt = newExpiryDays == null ? null : new Date(Date.now() + newExpiryDays * 86400000).toISOString();
    setKeys((prev) => [{ id: `key_${Date.now()}`, name, preview: maskKey(key), createdAt: new Date().toISOString(), expiresAt }, ...prev]);
    setRevealKey({ name, key }); // transition the dialog to the one-time reveal step
  };

  const copyReveal = () => {
    if (!revealKey) return;
    navigator.clipboard?.writeText(revealKey.key).catch(() => { /* ignore */ });
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const revoke = (id: string) => setKeys((prev) => prev.filter((k) => k.id !== id));

  return (
    <div className="flex-1 overflow-y-auto bg-[#252523] font-geist animate-fade-in">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-8 lg:py-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
          <div>
            <h1 className="text-[30px] lg:text-[34px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">API Keys</h1>
            <p className="text-[13.5px] font-geist text-[#8C8880] mt-2">Create and manage keys to access the hypr API from your own apps.</p>
          </div>
          <button onClick={openCreate} className="btn-bump btn-bump-accent px-4 py-2.5 text-[13px] self-start sm:self-auto">
            <Plus size={16} /> Create API Key
          </button>
        </div>

        {/* Keys list */}
        {keys.length === 0 ? (
          <div className="card-elev rounded-2xl py-16 flex flex-col items-center text-center">
            <span className="w-14 h-14 rounded-2xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center mb-4">
              <Key size={26} className="text-[#9C968E]" />
            </span>
            <h3 className="text-[16px] font-geist font-semibold text-[#F4F0EB]">No API keys yet</h3>
            <p className="text-[13px] font-geist text-[#8C8880] mt-1.5 mb-5 max-w-[360px]">Create a key to authenticate requests to the hypr API from your applications and scripts.</p>
            <button onClick={openCreate} className="btn-bump btn-bump-accent px-4 py-2.5 text-[13px]">
              <Plus size={16} /> Create API Key
            </button>
          </div>
        ) : (
          <div className="card-elev rounded-2xl overflow-hidden">
            <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-[#3D3A37] text-[11px] font-geist font-semibold uppercase tracking-wider text-[#6B6762]">
              <span className="col-span-3">Name</span>
              <span className="col-span-3">Secret key</span>
              <span className="col-span-2">Created</span>
              <span className="col-span-2">Expires</span>
              <span className="col-span-2 text-right">Actions</span>
            </div>
            <div className="divide-y divide-[#33302E]">
              {keys.map((k) => (
                <div key={k.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-4 items-center hover:bg-[#2A2826] transition-colors">
                  <div className="sm:col-span-3 flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center shrink-0"><Key size={15} className="text-[#9C968E]" /></span>
                    <span className="text-[13.5px] font-geist font-medium text-[#F4F0EB] truncate">{k.name}</span>
                  </div>
                  <div className="sm:col-span-3 min-w-0">
                    <code className="text-[12.5px] font-geist-mono text-[#8C8880] truncate block">{k.preview}</code>
                  </div>
                  <div className="sm:col-span-2 text-[12.5px] font-geist text-[#8C8880]">{fmtDate(k.createdAt)}</div>
                  <div className="sm:col-span-2 text-[12.5px] font-geist">
                    {(() => { const e = expiryInfo(k.expiresAt); return <span className={e.expired ? 'text-[#F87171]' : 'text-[#8C8880]'}>{e.text}</span>; })()}
                  </div>
                  <div className="sm:col-span-2 flex sm:justify-end">
                    <button onClick={() => revoke(k.id)} className="flex items-center gap-1.5 text-[12px] font-geist font-medium text-[#F87171]/80 hover:text-[#F87171] px-2.5 py-1.5 rounded-md hover:bg-[#F87171]/10 transition-colors">
                      <Trash2 size={13} /> Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create / one-time reveal dialog */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => { if (!revealKey) closeModal(); }}  // can't dismiss the reveal step by clicking away
        >
          <div className="w-full max-w-[480px] card-elev rounded-2xl p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>

            {!revealKey ? (
              <>
                {/* Step 1 — name the key */}
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[18px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Create API Key</h2>
                  <button onClick={closeModal} className="p-1 rounded-md text-[#8C8880] hover:text-[#F4F0EB] hover:bg-[#33302E] transition-colors"><X size={18} /></button>
                </div>
                <label className="block text-[11px] font-geist font-semibold uppercase tracking-wider text-[#8C8880] mb-1.5">Key name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && createKey()}
                  placeholder="e.g. Production server"
                  className="w-full bg-[#1E1D1C] border border-[#3D3A37] rounded-lg px-3.5 py-2.5 text-[14px] font-geist text-[#F4F0EB] placeholder:text-[#6B6762] outline-none focus:border-[#57534E] transition-colors mb-2"
                />
                <p className="text-[11.5px] font-geist text-[#6B6762] mb-4">A name helps you remember where this key is used.</p>

                <label className="block text-[11px] font-geist font-semibold uppercase tracking-wider text-[#8C8880] mb-2">Expiration</label>
                <div className="flex flex-wrap gap-2 mb-5">
                  {EXPIRY_OPTIONS.map((o) => {
                    const sel = newExpiryDays === o.days;
                    return (
                      <button
                        key={o.label}
                        onClick={() => setNewExpiryDays(o.days)}
                        className={`px-3 py-1.5 rounded-lg text-[12.5px] font-geist font-medium border transition-colors ${sel ? 'bg-[#C9A66B]/15 border-[#C9A66B]/40 text-[#C9A66B]' : 'bg-[#1E1D1C] border-[#3D3A37] text-[#C7C2BC] hover:border-[#57534E]'}`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2.5">
                  <button onClick={closeModal} className="px-4 py-2.5 text-[13px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors">Cancel</button>
                  <button onClick={createKey} className="btn-bump btn-bump-accent px-5 py-2.5 text-[13px]">
                    <Plus size={15} /> Create key
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Step 2 — show the secret once */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[18px] font-geist font-semibold text-[#F4F0EB] tracking-tight">Save your API key</h2>
                  <button onClick={closeModal} className="p-1 rounded-md text-[#8C8880] hover:text-[#F4F0EB] hover:bg-[#33302E] transition-colors"><X size={18} /></button>
                </div>

                <div className="flex items-start gap-2.5 bg-[#2A2318] border border-[#5A4A28] rounded-xl px-3.5 py-3 mb-4">
                  <TriangleAlert size={16} className="text-[#C9A66B] shrink-0 mt-0.5" />
                  <p className="text-[12px] font-geist text-[#D8C8A8] leading-relaxed">
                    Copy your secret key now and store it somewhere safe. For security reasons, <span className="font-semibold text-[#F4F0EB]">you won't be able to view it again</span>.
                  </p>
                </div>

                <label className="block text-[11px] font-geist font-semibold uppercase tracking-wider text-[#8C8880] mb-1.5">{revealKey.name}</label>
                <div className="flex items-center gap-2 mb-5">
                  <code className="flex-1 min-w-0 truncate bg-[#161514] border border-[#3D3A37] rounded-lg px-3 py-2.5 text-[12.5px] font-geist-mono text-[#D8B48C]">{revealKey.key}</code>
                  <button onClick={copyReveal} className="btn-bump btn-bump-dark px-3 py-2.5 text-[12px] shrink-0">
                    {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button onClick={closeModal} className="btn-bump btn-bump-accent px-5 py-2.5 text-[13px]">Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
