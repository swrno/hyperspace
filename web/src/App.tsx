import React, { useState, useEffect, useRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getTimeBasedGreeting } from './greetings';
import type {
  ActiveScreen, AdminUser, Chat, Connector, Connectors,
  ConnectorItem, ConnectorStage, Message, Platform, Settings, User, Application,
} from './types';
import {
  Send, Trash2, Download, Sun, Moon, Copy, Menu, X,
  Bot, User as UserIcon, Check, Plus, Settings as SettingsIcon, Edit2, MessageSquare,
  ChevronLeft, ChevronDown, Paperclip, Zap, Terminal, Brain,
  PanelLeftClose, PanelLeftOpen, MoreHorizontal, ThumbsUp, ThumbsDown,
  Mic, Image as ImageIcon, Search, Pencil, RefreshCw, Shield, Users, LogOut, Key,
  LayoutDashboard, Database, Blocks, MessagesSquare, ArrowRight, ArrowUpRight,
  LayoutGrid, AppWindow, Link2, Link2Off, SlidersHorizontal, Cpu, Unlink,
} from 'lucide-react';
import { auth, signInWithGoogle, logout } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Dashboard from './Dashboard';
import KnowledgeBases from './KnowledgeBases';
import ErrorBoundary from './ErrorBoundary';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

// --- UTILS ---
const setCookie = (name: string, value: string, days = 7) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax; Secure`;
};

const getCookie = (name: string): string => {
  return document.cookie.split('; ').reduce((r, v) => {
    const parts = v.split('=');
    return parts[0] === name ? decodeURIComponent(parts[1]) : r;
  }, '');
};

const deleteCookie = (name: string) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
};

// --- ENTERPRISE DATA CONNECTORS ---
// Mirrors the Enterprise Data Layer from the architecture: each source is
// authorized, then the user picks exactly which items to ingest into the
// Cognee knowledge graph.
const PLATFORMS: Platform[] = [
  {
    id: 'github', name: 'GitHub', slug: 'github', color: 'E7E1DA',
    noun: 'repository', nounPlural: 'repositories',
    selectTitle: 'Select repositories to ingest',
    authBlurb: 'Read-only access to the repositories you choose. Commits, pull requests and issues become connected nodes in your knowledge graph.',
    scopes: ['Read repository contents & metadata', 'Read pull requests & issues', 'No write access, ever'],
  },
  {
    id: 'gdocs', name: 'Google Docs', slug: 'googledocs', color: '4285F4',
    noun: 'document', nounPlural: 'documents',
    selectTitle: 'Select documents to ingest',
    authBlurb: 'Read-only access to the docs you select. Structure, tables and sections are preserved with Docling before graph extraction.',
    scopes: ['Read selected documents only', 'Preserve document structure', 'No edits to your files'],
  },
  {
    id: 'gslides', name: 'Google Slides', slug: 'googleslides', color: 'FBBC04',
    noun: 'presentation', nounPlural: 'presentations',
    selectTitle: 'Select presentations to ingest',
    authBlurb: 'Read-only access to selected decks. Slide hierarchy is kept intact so context is never lost between slides.',
    scopes: ['Read selected decks only', 'Preserve slide hierarchy', 'No edits to your files'],
  },
  {
    id: 'gsheets', name: 'Google Sheets', slug: 'googlesheets', color: '34A853',
    noun: 'spreadsheet', nounPlural: 'spreadsheets',
    selectTitle: 'Select spreadsheets to ingest',
    authBlurb: 'Read-only access to the sheets you select. Rows and columns are flattened into searchable, connected nodes.',
    scopes: ['Read selected spreadsheets only', 'Preserve tabular structure', 'No edits to your files'],
  },
  {
    id: 'gcal', name: 'Google Calendar', slug: 'googlecalendar', color: '4285F4',
    noun: 'event', nounPlural: 'events',
    selectTitle: 'Select events to ingest',
    authBlurb: 'Read-only access to selected events. Meetings, attendees and agendas become connected context in your graph.',
    scopes: ['Read selected events only', 'Link attendees & agendas', 'No changes to your calendar'],
  },
  {
    id: 'jira', name: 'Jira', slug: 'jira', color: '2684FF',
    noun: 'project', nounPlural: 'projects',
    selectTitle: 'Select projects to ingest',
    authBlurb: 'Read-only access to selected projects. Issues, statuses and discussions are linked to the repos and docs that mention them.',
    scopes: ['Read issues & comments', 'Track status transitions', 'No write access'],
  },
  {
    id: 'slack', name: 'Slack', slug: 'slack', color: '36C5F0',
    noun: 'channel', nounPlural: 'channels',
    selectTitle: 'Select channels to ingest',
    authBlurb: 'Read-only access to selected channels. High-signal decisions are extracted and connected across your tools.',
    scopes: ['Read messages in chosen channels', 'Resolve threads & mentions', 'No posting on your behalf'],
  },
  {
    id: 'salesforce', name: 'Salesforce', slug: 'salesforce', color: '00A1E0',
    noun: 'account', nounPlural: 'accounts',
    selectTitle: 'Select accounts to ingest',
    authBlurb: 'Read-only access to selected accounts. Agreements and opportunities are traced to the docs and tickets behind them.',
    scopes: ['Read accounts & opportunities', 'Link agreement documents', 'No write access'],
  },
];
const PLATFORM_MAP: Record<string, Platform> = Object.fromEntries(PLATFORMS.map(p => [p.id, p]));


const platformIcon = (p: { id: string }, size = 15): ReactNode => {
  const s = size;
  const icons: Record<string, ReactNode> = {
    github: (
      <svg viewBox="0 0 24 24" width={s} height={s} fill="#E7E1DA" className="shrink-0">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
    gdocs: (
      <svg viewBox="0 0 30 40" width={s * 0.75} height={s} className="shrink-0">
        <path d="M18 0H2C.9 0 0 .9 0 2v36c0 1.1.9 2 2 2h26c1.1 0 2-.9 2-2V12z" fill="#4285F4"/>
        <path d="M18 0l12 12H18z" fill="#A8C7FA"/>
        <rect x="4" y="18" width="22" height="2.5" rx="1" fill="#fff"/>
        <rect x="4" y="24" width="22" height="2.5" rx="1" fill="#fff"/>
        <rect x="4" y="30" width="14" height="2.5" rx="1" fill="#fff"/>
      </svg>
    ),
    gslides: (
      <svg viewBox="0 0 30 40" width={s * 0.75} height={s} className="shrink-0">
        <path d="M18 0H2C.9 0 0 .9 0 2v36c0 1.1.9 2 2 2h26c1.1 0 2-.9 2-2V12z" fill="#FBBC04"/>
        <path d="M18 0l12 12H18z" fill="#FDE68A"/>
        <rect x="4" y="16" width="22" height="16" rx="1.5" fill="#fff" opacity="0.9"/>
        <path d="M13 19l8 5-8 5V19z" fill="#FBBC04"/>
      </svg>
    ),
    jira: (
      <svg viewBox="0 0 256 257" width={s} height={s} className="shrink-0">
        <defs>
          <linearGradient id="jG1" x1="105%" x2="50%" y1="-1%" y2="45%"><stop offset="18%" stopColor="#0052CC"/><stop offset="100%" stopColor="#2684FF"/></linearGradient>
          <linearGradient id="jG2" x1="-4%" x2="51%" y1="101%" y2="55%"><stop offset="18%" stopColor="#0052CC"/><stop offset="100%" stopColor="#2684FF"/></linearGradient>
        </defs>
        <path fill="#2684FF" d="M244.658 0H121.707a55.502 55.502 0 0 0 55.502 55.502h22.649V77.37c.02 30.625 24.841 55.447 55.466 55.467V11.342C255.324 5.076 250.248 0 244.658 0z"/>
        <path fill="url(#jG1)" d="M183.822 61.262H60.87c.019 30.625 24.84 55.447 55.466 55.467h22.648v21.867c.02 30.625 24.841 55.447 55.466 55.467V72.605c0-6.265-5.076-11.342-10.628-11.342z"/>
        <path fill="url(#jG2)" d="M122.951 122.489H0c0 30.653 24.85 55.502 55.502 55.502h22.649v21.868C78.17 230.642 103.02 257 133.65 256.98V133.83c0-6.265-5.076-11.341-10.699-11.341z"/>
      </svg>
    ),
    slack: (
      <svg viewBox="0 0 54 54" width={s} height={s} className="shrink-0">
        <path d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386" fill="#36C5F0"/>
        <path d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387" fill="#2EB67D"/>
        <path d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386" fill="#ECB22E"/>
        <path d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.249m14.336 0v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.249a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.387" fill="#E01E5A"/>
      </svg>
    ),
    salesforce: (
      <svg viewBox="0 0 256 180" width={s} height={s} className="shrink-0">
        <path fill="#00A1E0" d="M106.67 33.5c8.65-9 20.7-14.6 34.09-14.6 17.66 0 33.13 9.69 41.46 24.14a54.28 54.28 0 0 1 21.3-4.36c30.14 0 54.55 24.62 54.55 54.99s-24.41 55-54.55 55a54.3 54.3 0 0 1-10.39-1.01c-7.27 13.66-21.5 22.93-37.83 22.93-6.57 0-12.8-1.52-18.35-4.21-7.14 17.77-24.66 30.33-45.11 30.33-20.62 0-38.27-12.73-45.37-30.75a43.65 43.65 0 0 1-10.46 1.28C16.43 167.24 0 150.65 0 130.16c0-13.75 7.36-25.83 18.3-32.4a55.57 55.57 0 0 1-1.6-13.4c0-30.72 24.67-55.63 55.12-55.63 13.4 0 25.7 4.78 35.14 12.77z"/>
      </svg>
    ),
    gsheets: (
      <svg viewBox="0 0 30 40" width={s * 0.75} height={s} className="shrink-0">
        <path d="M18 0H2C.9 0 0 .9 0 2v36c0 1.1.9 2 2 2h26c1.1 0 2-.9 2-2V12z" fill="#34A853"/>
        <path d="M18 0l12 12H18z" fill="#A8DAB5"/>
        <rect x="6" y="18" width="18" height="14" rx="1" fill="#fff"/>
        <rect x="6" y="22" width="18" height="1.6" fill="#34A853"/>
        <rect x="6" y="26.6" width="18" height="1.6" fill="#34A853"/>
        <rect x="14.4" y="18" width="1.6" height="14" fill="#34A853"/>
      </svg>
    ),
    gcal: (
      <svg viewBox="0 0 24 24" width={s} height={s} className="shrink-0">
        <rect x="3" y="4.5" width="18" height="16.5" rx="2" fill="#fff"/>
        <path d="M3 9h18V6.5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2V9z" fill="#4285F4"/>
        <rect x="6.5" y="2.5" width="2" height="4" rx="1" fill="#4285F4"/>
        <rect x="15.5" y="2.5" width="2" height="4" rx="1" fill="#4285F4"/>
        <text x="12" y="18.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#4285F4" fontFamily="Arial, sans-serif">31</text>
      </svg>
    ),
  };
  return icons[p.id] || <span style={{ width: s, height: s, display: 'inline-block' }} />;
};

const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const formatTime = (isoString: string) => {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Platforms with real OAuth backends
const OAUTH_PLATFORMS = ['github', 'jira', 'gdocs', 'gslides', 'gsheets', 'gcal'];
// Platforms not yet implemented — show Coming Soon
const COMING_SOON_PLATFORMS = ['slack', 'salesforce'];

const groupChatsByDate = (chats: Chat[]) => {
  const groups: Record<string, Chat[]> = {
    today: [],
    yesterday: [],
    last7Days: [],
    older: []
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const last7Days = new Date(today);
  last7Days.setDate(last7Days.getDate() - 7);

  chats.forEach(chat => {
    const chatDate = new Date(chat.updatedAt);
    if (chatDate >= today) {
      groups.today.push(chat);
    } else if (chatDate >= yesterday) {
      groups.yesterday.push(chat);
    } else if (chatDate >= last7Days) {
      groups.last7Days.push(chat);
    } else {
      groups.older.push(chat);
    }
  });

  Object.keys(groups).forEach(key => {
    groups[key].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });

  return groups;
};

// --- COMPONENTS ---

const generateSarcasticReasoning = (prompt: string, responseText: string): string => {
  const p = prompt.toLowerCase();

  if (p.includes('github') || p.includes('repo') || p.includes('pull request') || p.includes('commit') || p.includes('branch')) {
    return `Query involves GitHub data.

- Checking the knowledge graph for relevant repository context.
- Looking for linked Jira tickets, PR discussions, and commit history.
- Surfacing multi-hop connections across connected sources.

Assembling a grounded answer from the graph.`;
  }

  if (p.includes('jira') || p.includes('ticket') || p.includes('issue') || p.includes('sprint') || p.includes('backlog') || p.includes('epic')) {
    return `Query involves project tracking data.

- Traversing Jira nodes in the knowledge graph.
- Checking for linked GitHub PRs and Slack discussions.
- Identifying cross-platform context for this issue.

Building a complete picture from connected sources.`;
  }

  if (p.includes('slack') || p.includes('channel') || p.includes('message') || p.includes('thread') || p.includes('mention')) {
    return `Query involves team communication data.

- Searching Slack channel nodes in the graph.
- Linking conversation context to related tickets and docs.
- Extracting signal from the noise.

Synthesizing the relevant thread context.`;
  }

  if (p.includes('doc') || p.includes('document') || p.includes('slide') || p.includes('notion') || p.includes('confluence') || p.includes('spec') || p.includes('requirements')) {
    return `Query involves documentation.

- Querying document nodes in the knowledge graph.
- Checking structural hierarchy and cross-references.
- Linking to the tickets and repos that reference this doc.

Grounding the answer in your connected documentation.`;
  }

  if (p.includes('salesforce') || p.includes('account') || p.includes('opportunity') || p.includes('crm') || p.includes('customer') || p.includes('deal')) {
    return `Query involves CRM data.

- Traversing Salesforce account nodes.
- Linking accounts to relevant documents and discussions.
- Building cross-platform context for this customer.

Connecting CRM data with the rest of the knowledge graph.`;
  }

  if (p.includes('who') || p.includes('what is') || p.includes('explain') || p.includes('how does') || p.includes('what are')) {
    return `Conceptual query detected.

- Searching the knowledge graph for entity definitions and relationships.
- Checking for context across connected data sources.
- Identifying the most relevant nodes for this question.

Constructing a grounded explanation from the graph.`;
  }

  if (p.includes('connect') || p.includes('integrate') || p.includes('sync') || p.includes('ingest') || p.includes('authorize')) {
    return `Integration query detected.

- Checking which data sources are currently connected.
- Reviewing ingestion status and last sync timestamps.
- Identifying gaps in the knowledge graph.

Answering from the current connector state.`;
  }

  return `Processing query: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"

- Querying the Cognee knowledge graph for relevant context.
- Traversing cross-platform entity relationships.
- Grounding the response in your connected data sources.

Generating a knowledge-graph-backed response.`;
};

// ─── Collapsible Reasoning Components ───────────────────────────────────────
interface ReasoningCtx {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  seconds: number;
  customStreaming: boolean;
}
const ReasoningContext = React.createContext<ReasoningCtx | null>(null);

const Reasoning = ({ isStreaming, initialSeconds = 4, customStreaming = false, children }: {
  isStreaming: boolean;
  initialSeconds?: number;
  customStreaming?: boolean;
  children: ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [seconds, setSeconds] = useState(initialSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setIsOpen(false);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStreaming]);

  return (
    <ReasoningContext.Provider value={{ isStreaming, isOpen, setIsOpen, seconds, customStreaming }}>
      <div className="w-full my-2 select-none transition-all duration-300">
        {children}
      </div>
    </ReasoningContext.Provider>
  );
};

const ReasoningTrigger = () => {
  const context = React.useContext(ReasoningContext);
  if (!context) return null;
  const { isStreaming, isOpen, setIsOpen, seconds } = context;

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="flex items-center gap-2 text-[13px] text-[#8C8880] hover:text-[#F4F0EB] transition-colors cursor-pointer outline-none select-none py-1 bg-transparent border-none"
    >
      <Brain size={15} className={`shrink-0 ${isStreaming ? "text-[#C9A66B] animate-pulse" : "text-[#8C8880]"}`} />
      <span className={`font-basel font-normal ${isStreaming ? 'text-shimmer' : ''}`}>
        {isStreaming
          ? `Thinking for ${seconds} second${seconds === 1 ? '' : 's'}...`
          : `Thought for ${seconds} second${seconds === 1 ? '' : 's'}`
        }
      </span>
      <ChevronDown
        size={13}
        className={`text-[#6B6762] transition-transform duration-200 transform ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
  );
};

const ReasoningContent = ({ children }: { children?: ReactNode }) => {
  const context = React.useContext(ReasoningContext);
  if (!context) return null;
  const { isOpen, isStreaming, seconds, customStreaming } = context;

  if (!isOpen) return null;

  let contentToRender = children;
  if (isStreaming && !customStreaming) {
    if (seconds < 3) {
      contentToRender = "Analyzing prompt constraints and preparing premium response parameters...";
    } else if (seconds < 6) {
      contentToRender = "Formulating reasoning pathway and evaluating source context...";
    } else if (seconds < 10) {
      contentToRender = "Synthesizing response options and optimizing semantic output...";
    } else {
      contentToRender = "Finalizing deep logical validation for ultra accuracy...";
    }
  }

  return (
    <div className={`mt-1.5 text-[13.5px] font-basel leading-relaxed text-[#8C8880] whitespace-pre-wrap select-text max-h-[220px] overflow-y-auto pr-2 custom-scrollbar border-l border-[#3D3A37] pl-3.5 py-0.5 ${isStreaming ? 'animate-pulse' : ''}`}>
      {contentToRender}
    </div>
  );
};

const SidebarItem = ({ chat, isActive, onClick, onDelete, onRename }: {
  chat: Chat;
  isActive: boolean;
  onClick: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(chat.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isRenaming]);

  const handleRenameSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (renameValue.trim()) {
      onRename(chat.id, renameValue.trim());
      setIsRenaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit(e);
    if (e.key === 'Escape') {
      setRenameValue(chat.title);
      setIsRenaming(false);
    }
  };

  return (
    <div
      className={`group relative w-full px-3 py-2 rounded-lg cursor-pointer flex items-center gap-3 transition-all duration-200
        ${isActive
          ? 'bg-accent-light text-accent font-medium'
          : 'hover:bg-hover text-txt-secondary hover:text-txt-primary'
        }`}
      onClick={onClick}
    >
      <MessageSquare size={18} className={`shrink-0 ${isActive ? 'text-accent' : 'text-txt-tertiary group-hover:text-txt-secondary'}`} />

      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => setIsRenaming(false)}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-transparent border-b border-accent outline-none min-w-0 text-sm font-body"
        />
      ) : (
        <span className="truncate flex-1 text-sm font-body">{chat.title}</span>
      )}

      {!isRenaming && (
        <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-hover pl-2">
          <button
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
            className="p-1 hover:bg-border-light rounded text-txt-secondary transition-colors"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(chat.id); }}
            className="p-1 hover:bg-red-100 text-txt-secondary hover:text-error rounded transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

const SettingsModal = ({ isOpen, onClose, settings, onSave, onClearAll, connectors, openConnector, disconnectPlatform, user, onSignOut }: {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (s: Settings) => void;
  onClearAll: () => void;
  connectors?: Connectors;
  openConnector?: (id: string) => void;
  disconnectPlatform?: (id: string) => void;
  user: User | null;
  onSignOut?: () => void;
}) => {
  if (!isOpen) return null;
  const [tab, setTab] = useState('general');
  const [localSettings, setLocalSettings] = useState(settings);

  const tabs = [
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'connections', label: 'Connections', icon: Blocks },
    { id: 'account', label: 'Account', icon: UserIcon },
  ];

  const tierLabel = user?.role === 'admin' ? 'Admin' : user?.tier === 'ultra' ? 'Ultra' : user?.tier === 'pro' ? 'Pro' : 'Free';
  const tierAccent = tierLabel === 'Free';

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-geist" onClick={onClose}>
      <div className="w-full max-w-[660px] bg-[#252523] rounded-2xl shadow-2xl flex overflow-hidden animate-slide-up border border-[#3D3A37] max-h-[86vh]" onClick={e => e.stopPropagation()}>

        {/* Left tab rail */}
        <div className="w-[176px] shrink-0 bg-[#1E1D1C] border-r border-[#3D3A37] flex flex-col py-5 px-3 gap-1">
          <p className="text-[10px] font-geist font-semibold uppercase tracking-[0.14em] text-[#6B6762] px-2.5 mb-2.5">Settings</p>
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            const n = t.id === 'connections' ? PLATFORMS.filter(p => connectors?.[p.id]?.connected).length : 0;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-geist font-medium transition-all ${active ? 'bg-[#33302E] text-[#F4F0EB] border border-[#4A4744] shadow-[0_2px_0_0_#1a1917]' : 'text-[#8C8880] border border-transparent hover:text-[#F4F0EB] hover:bg-[#2A2826]'}`}
              >
                <Icon size={15} className={active ? 'text-[#F4F0EB]' : 'text-[#8C8880]'} />
                <span className="flex-1 text-left">{t.label}</span>
                {n > 0 && <span className="text-[10px] font-geist font-semibold tabular-nums text-[#8FAE97] bg-[#1E2A22] border border-[#2E4636] px-1.5 py-0.5 rounded-md">{n}</span>}
              </button>
            );
          })}
          <div className="mt-auto pt-4 border-t border-[#33302E]">
            <button onClick={onClose} className="w-full flex items-center gap-2 px-2.5 py-2 text-[12px] font-geist font-medium text-[#6B6762] hover:text-[#F4F0EB] transition-colors">
              <X size={14} /> Close
            </button>
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── General ── */}
          {tab === 'general' && (
            <div className="flex-1 overflow-y-auto p-7 space-y-7">
              <div>
                <h2 className="text-[22px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">General</h2>
                <p className="text-[12.5px] font-geist text-[#8C8880] mt-2">Model preferences and data controls.</p>
              </div>
              <div className="space-y-2.5">
                <label className="block text-[11px] font-geist font-semibold uppercase tracking-[0.12em] text-[#8C8880]">Default retrieval mode</label>
                <div className="relative">
                  <select
                    value={localSettings.model}
                    onChange={(e) => setLocalSettings({ ...localSettings, model: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#3D3A37] bg-[#1E1D1C] text-[#F4F0EB] appearance-none focus:outline-none focus:border-[#57534E] font-geist text-[13px] font-medium transition-colors cursor-pointer"
                  >
                    <option value="normal">Normal retrieval — fast</option>
                    <option value="deep">Deep retrieval — multi-hop</option>
                    <option value="hyper">Hyper retrieval — deepest</option>
                  </select>
                  <Zap size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#9C968E]" />
                  <ChevronDown size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6B6762]" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-geist font-semibold uppercase tracking-[0.12em] text-[#8C8880] mb-2.5">Danger zone</label>
                <button
                  onClick={onClearAll}
                  className="w-full px-4 py-3 rounded-xl border border-[#5A3A38] bg-[rgba(194,131,121,0.06)] text-[#C28379] font-geist font-medium text-[13px] hover:bg-[rgba(194,131,121,0.12)] transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={15} /> Clear all chat history
                </button>
              </div>
              <div className="flex justify-end gap-2.5 pt-1">
                <button onClick={onClose} className="px-4 py-2.5 text-[13px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors">Cancel</button>
                <button
                  onClick={() => { onSave(localSettings); onClose(); }}
                  className="btn-bump btn-bump-accent px-6 py-2.5 text-[13px] font-geist"
                >
                  Save changes
                </button>
              </div>
            </div>
          )}

          {/* ── Connections ── */}
          {tab === 'connections' && (
            <div className="flex-1 overflow-y-auto">
              <div className="px-7 pt-7 pb-4">
                <h2 className="text-[22px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">Connections</h2>
                <p className="text-[12.5px] font-geist text-[#8C8880] mt-2">Authorize data sources. hypr ingests only what you select.</p>
              </div>
              <div className="px-4 pb-2 space-y-1.5">
                {PLATFORMS.map(p => {
                  const c = connectors?.[p.id];
                  const connected = c?.connected;
                  const comingSoon = COMING_SOON_PLATFORMS.includes(p.id);
                  const lastSync = c?.lastSync ? new Date(c.lastSync).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
                  return (
                    <div key={p.id} className={`flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-[#2A2826] transition-colors ${comingSoon ? 'opacity-50' : ''}`}>
                      <div className="w-10 h-10 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center shrink-0">
                        {platformIcon(p, 18)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-geist font-semibold text-[#F4F0EB]">{p.name}</span>
                          {comingSoon && <span className="text-[10px] font-geist font-semibold text-[#C9A66B] bg-[#2A2318] border border-[#5A4A28] px-1.5 py-0.5 rounded-md uppercase tracking-wide">Soon</span>}
                          {!comingSoon && connected && (
                            <span className="flex items-center gap-1.5 text-[10px] font-geist font-semibold text-[#8FAE97] bg-[#1E2A22] border border-[#2E4636] px-1.5 py-0.5 rounded-md">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#8FAE97]"></span> Connected
                            </span>
                          )}
                        </div>
                        <p className="text-[11.5px] font-geist text-[#8C8880] mt-0.5 truncate">
                          {comingSoon ? 'Coming soon.' : connected ? `Authorized${lastSync ? ` · ${lastSync}` : ''}` : p.authBlurb.split('.')[0] + '.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!comingSoon && connected && (
                          <button
                            onClick={() => disconnectPlatform?.(p.id)}
                            className="text-[12px] font-geist font-medium px-2.5 py-2 rounded-lg text-[#BFA39C] hover:text-[#C28379] hover:bg-[rgba(194,131,121,0.08)] transition-colors"
                          >
                            Disconnect
                          </button>
                        )}
                        {!comingSoon && !connected && (
                          <button
                            onClick={() => { onClose(); setTimeout(() => openConnector?.(p.id), 80); }}
                            className="btn-bump btn-bump-accent px-3.5 py-2 text-[12px] font-geist"
                          >
                            Connect
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Account ── */}
          {tab === 'account' && (
            <div className="flex-1 overflow-y-auto p-7 space-y-6">
              <div>
                <h2 className="text-[22px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">Account</h2>
                <p className="text-[12.5px] font-geist text-[#8C8880] mt-2">Your profile and subscription details.</p>
              </div>
              <div className="flex items-center gap-4 p-4 bg-[#1E1D1C] rounded-2xl border border-[#3D3A37]">
                {user?.avatar ? (
                  <img src={user.avatar} alt="avatar" referrerPolicy="no-referrer" className="w-12 h-12 rounded-full object-cover border border-[#57534E]" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#33302E] border border-[#57534E] flex items-center justify-center text-[#F4F0EB] text-[18px] font-geist font-semibold uppercase">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-geist font-semibold text-[#F4F0EB] truncate">{user?.name}</p>
                  <p className="text-[12px] font-geist text-[#8C8880] truncate">{user?.email}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-geist font-semibold uppercase tracking-[0.1em] px-2.5 py-1 rounded-md border ${tierAccent ? 'bg-[#1E1D1C] text-[#9C968E] border-[#4A4744]' : 'bg-[#33302E] text-[#F4F0EB] border-[#57534E]'}`}>
                  {tierLabel}
                </span>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => { onSignOut?.(); onClose(); }}
                  className="w-full btn-bump btn-bump-dark px-4 py-3 text-[13px] font-geist"
                >
                  <LogOut size={15} /> Sign out
                </button>
                <button
                  onClick={onClearAll}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#5A3A38] bg-[rgba(194,131,121,0.06)] text-[#C28379] hover:bg-[rgba(194,131,121,0.12)] font-geist font-medium text-[13px] transition-colors"
                >
                  <Trash2 size={15} /> Clear all chat history
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = getCookie('orgmind_auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [idToken, setIdToken] = useState<string | null>(() => {
    return getCookie('orgmind_auth_token') || null;
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard'); // 'dashboard' | 'applications' | 'knowledge' | 'integrations' | 'admin'
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminUpdatingUid, setAdminUpdatingUid] = useState<string | null>(null);
  const [activeDropdownUid, setActiveDropdownUid] = useState<string | null>(null);

  // Email Authentication & Sign-in states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login'); // 'login' | 'signup' | 'forgot'
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');
  const [authError, setAuthError] = useState('');
  const [authFormLoading, setAuthFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Mockup chat loop states for animating the login preview
  const [mockStep, setMockStep] = useState(0);
  const [mockTypedText, setMockTypedText] = useState('');
  const [mockReasoningText, setMockReasoningText] = useState('');
  const [mockReasoningStreaming, setMockReasoningStreaming] = useState(false);
  const mockupMessagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mockupMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mockStep, mockReasoningText]);

  useEffect(() => {
    if (user) return;
    const fullText = "How do I set up auth?";
    const FULL_REASONING_TEXT = `Let me think about this step by step.

First, the user is asking about authentication. I need to consider:
- What framework are they using? Or are they too incompetent to even pick one?
- Do they need session-based or token-based auth? Or maybe they just want me to write all their code because they are lazy as fuck.

Actually, wait - I should check if they already have any auth setup. Let me reconsider, they probably don't even know what Firebase is.`;

    let textIndex = 0;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;
    let stepTimer: ReturnType<typeof setTimeout> | undefined;
    let reasoningTimer: ReturnType<typeof setTimeout> | undefined;

    const runStep = (step: number) => {
      setMockStep(step);
      if (step === 0) {
        setMockTypedText('');
        setMockReasoningText('');
        setMockReasoningStreaming(false);
        textIndex = 0;
        const type = () => {
          if (textIndex <= fullText.length) {
            setMockTypedText(fullText.slice(0, textIndex));
            textIndex++;
            typingTimer = setTimeout(type, 80 + Math.random() * 40); // human typing cadence
          } else {
            stepTimer = setTimeout(() => runStep(1), 1000);
          }
        };
        type();
      } else if (step === 1) {
        stepTimer = setTimeout(() => runStep(2), 1000);
      } else if (step === 2) {
        setMockReasoningStreaming(true);
        let charIndex = 0;
        const streamReasoning = () => {
          charIndex += 2;
          const next = FULL_REASONING_TEXT.slice(0, charIndex);
          setMockReasoningText(next);

          if (charIndex >= FULL_REASONING_TEXT.length) {
            setMockReasoningStreaming(false);
            stepTimer = setTimeout(() => runStep(3), 1500);
          } else {
            reasoningTimer = setTimeout(streamReasoning, 28);
          }
        };
        streamReasoning();
      } else {
        stepTimer = setTimeout(() => runStep(0), 8000);
      }
    };

    runStep(0);

    return () => {
      clearTimeout(typingTimer);
      clearTimeout(stepTimer);
      clearTimeout(reasoningTimer);
    };
  }, [user]);

  const handleEmailLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthError('Please fill in all credentials.');
      return;
    }
    setAuthFormLoading(true);
    setAuthError('');
    setAuthSuccessMsg('');

    // Secure Custom Administrator credentials check
    if (loginEmail.trim().toLowerCase() === 'soulsoumya1234@gmail.com') {
      if (loginPassword === 'SoumyaAdmin@2026!') {
        const mockAdminUser: User = {
          uid: 'admin-orgmind-uid',
          email: 'soulsoumya1234@gmail.com',
          name: 'Admin',
          role: 'admin',
          avatar: ''
        };
        setUser(mockAdminUser);
        setIdToken('admin-super-bypass-token-2026');
        localStorage.setItem('orgmind_admin_session', JSON.stringify(mockAdminUser));
        setAuthSuccessMsg('Welcome back, Admin!');
        setAuthFormLoading(false);
        return;
      } else {
        setAuthError('Incorrect password for administrator account.');
        setAuthFormLoading(false);
        return;
      }
    }

    try {
      const { signInWithEmailAndPassword } = await import('./firebase');
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch (err) {
      console.error(err);
      let errMsg = err.message || 'Failed to authenticate.';
      if (err.code === 'auth/user-not-found') errMsg = 'No account exists with this email.';
      if (err.code === 'auth/wrong-password') errMsg = 'Incorrect password. Try again.';
      if (err.code === 'auth/invalid-email') errMsg = 'Please check the formatting of your email.';
      setAuthError(errMsg);
    } finally {
      setAuthFormLoading(false);
    }
  };

  const handleEmailSignUp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthError('Please fill in all credentials.');
      return;
    }
    if (loginPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    setAuthFormLoading(true);
    setAuthError('');
    setAuthSuccessMsg('');
    try {
      const { createUserWithEmailAndPassword } = await import('./firebase');
      await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
      setAuthSuccessMsg('Account registered successfully! Logging you in...');
      setTimeout(() => setAuthMode('login'), 1500);
    } catch (err) {
      console.error(err);
      let errMsg = err.message || 'Failed to register account.';
      if (err.code === 'auth/email-already-in-use') errMsg = 'An account is already registered with this email address.';
      setAuthError(errMsg);
    } finally {
      setAuthFormLoading(false);
    }
  };

  const handleForgotPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!loginEmail.trim()) {
      setAuthError('Please enter your email address first.');
      return;
    }
    setAuthFormLoading(true);
    setAuthError('');
    setAuthSuccessMsg('');
    try {
      const { sendPasswordResetEmail } = await import('./firebase');
      await sendPasswordResetEmail(auth, loginEmail);
      setAuthSuccessMsg('Password reset link successfully dispatched to your email inbox.');
    } catch (err) {
      console.error(err);
      setAuthError(err.message || 'Failed to send recovery email.');
    } finally {
      setAuthFormLoading(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('orgmind_admin_session');
    deleteCookie('orgmind_auth_user');
    deleteCookie('orgmind_auth_token');
    try {
      const { logout: firebaseLogout } = await import('./firebase');
      await firebaseLogout();
    } catch (e) {
      console.error(e);
    }
    setUser(null);
    setIdToken(null);
    setChats([]);
    setConnectors({});
    // Purge connector caches (incl. the legacy global key) so nothing leaks
    // into the next account that logs in on this browser.
    try {
      Object.keys(localStorage)
        .filter((k) => k === 'hs_connectors' || k.startsWith('hs_connectors_'))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    setActiveScreen('dashboard');
    navigate('/login');
  };

  const [chats, setChats] = useState<Chat[]>([]);
  const { chatId, appId, kbId } = useParams<{ chatId?: string; appId?: string; kbId?: string }>();
  const navigate = useNavigate();
  const currentChatId = chatId || null;

  const [currentModel] = useState('gemini-2.5-flash'); // kept for API compatibility
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [kbList, setKbList] = useState<{ id: string; name: string }[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [settings, setSettings] = useState<Settings>({ model: 'gemini-2.5-flash', temperature: 0.7 });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameModal, setRenameModal] = useState<{ chatId: string; currentTitle: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ chatId: string } | null>(null);
  const [clearAllModal, setClearAllModal] = useState(false);
  // Connector / knowledge-graph ingestion state
  const [connectors, setConnectors] = useState<Connectors>({}); // { [platformId]: { connected, account, status, lastSync } }
  const [connectorModal, setConnectorModal] = useState<string | null>(null); // open platform id
  const [connectorStage, setConnectorStage] = useState<ConnectorStage>('auth'); // only 'auth' stage used now
  const [connectorBusy, setConnectorBusy] = useState(false);
  const [rateLimitMsg, setRateLimitMsg] = useState('');
  const [showCookieConsent, setShowCookieConsent] = useState(() => !localStorage.getItem('orgmind_cookie_consent'));
  const [activeDocModal, setActiveDocModal] = useState<'terms' | 'privacy' | null>(null);

  // Applications state
  const [applications, setApplications] = useState<Application[]>(() => {
    try { return JSON.parse(localStorage.getItem('hs_applications') || '[]'); } catch { return []; }
  });
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const [appTab, setAppTab] = useState<'playground' | 'knowledge' | 'settings'>('playground');
  const [showCreateApp, setShowCreateApp] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newAppDesc, setNewAppDesc] = useState('');
  const [appIsLoading, setAppIsLoading] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [appInput, setAppInput] = useState('');
  const appInputRef = useRef<HTMLTextAreaElement>(null);
  const appMessagesEndRef = useRef<HTMLDivElement>(null);
  const [appCopiedId, setAppCopiedId] = useState<number | string | null>(null);
  const [appSettingsForm, setAppSettingsForm] = useState<{
    systemPrompt: string; model: string; temperature: number; maxTokens: number;
  } | null>(null);

  const handleCookieConsent = (accepted: boolean) => {
    localStorage.setItem('orgmind_cookie_consent', accepted ? 'accepted' : 'declined');
    setShowCookieConsent(false);
  };

  // ── Connector helpers ──────────────────────────────────────────────
  // Cache is keyed per-user (derived from the token, so it stays in sync during
  // account switches) — a global key leaked one account's sources into another.
  const uidFromToken = (token: string | null): string => {
    if (!token) return 'anon';
    if (token === 'admin-super-bypass-token-2026') return 'admin-soulsoumya-uid';
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.user_id || payload.sub || 'anon';
    } catch { return 'anon'; }
  };
  // Bumped to v2: invalidates stale demo-era caches that left sources showing
  // "connected" even when nothing is actually connected / the backend is down.
  const CONNECTORS_CACHE_PREFIX = 'hs_connectors_v2_';
  const connectorsCacheKey = (token: string | null): string => `${CONNECTORS_CACHE_PREFIX}${uidFromToken(token)}`;
  // Remove every cached connector blob that isn't the given key. This is the
  // hard guarantee against cross-account leaks: only one user's cache ever lives
  // on the device, no matter how the previous session ended (logout, Google
  // "switch account", token refresh, tab reopen).
  const purgeOtherConnectorCaches = (keepKey: string | null) => {
    try {
      Object.keys(localStorage)
        .filter((k) => k === 'hs_connectors' || (k.startsWith(CONNECTORS_CACHE_PREFIX) && k !== keepKey))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  };
  const persistConnectorsLocal = (next: Connectors, token?: string | null) => {
    const t = token === undefined ? idToken : token;
    // Never write under the shared 'anon' bucket — two unidentifiable users
    // would otherwise read each other's sources.
    if (uidFromToken(t) === 'anon') return;
    try { localStorage.setItem(connectorsCacheKey(t), JSON.stringify(next)); } catch { /* ignore */ }
  };

  const loadConnectors = async (token: string | null) => {
    if (!token) { setConnectors({}); purgeOtherConnectorCaches(null); return; }
    const uid = uidFromToken(token);
    const key = connectorsCacheKey(token);
    // Drop any other account's cache up front so it can never flash through.
    purgeOtherConnectorCaches(key);
    // Instant paint from this user's own cache only — and only when we can
    // actually identify the user (an unparseable token must not read a shared
    // 'anon' bucket that may belong to a different account).
    if (uid !== 'anon') {
      try {
        const cached = JSON.parse(localStorage.getItem(key) || '{}');
        setConnectors(cached && typeof cached === 'object' ? cached : {});
      } catch { setConnectors({}); }
    } else {
      setConnectors({});
    }
    try {
      const res = await fetch('/api/connectors', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        // Server is authoritative — set even when empty so a fresh account
        // never inherits the previous user's connectors.
        setConnectors(data.connectors || {});
        persistConnectorsLocal(data.connectors || {}, token);
      }
    } catch (e) { console.warn('Failed to load connectors:', e.message); }
  };

  const saveConnector = async (platformId: string, payload: Connector) => {
    const next = { ...connectors, [platformId]: payload };
    setConnectors(next);
    persistConnectorsLocal(next);
    if (!idToken) return;
    try {
      await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'save', platform: platformId, ...payload }),
      });
    } catch (e) { console.warn('Failed to save connector:', e.message); }
  };

  const openConnector = (platformId: string) => {
    setConnectorModal(platformId);
    setConnectorStage('auth');
    setConnectorBusy(false);
  };

  const closeConnector = () => {
    setConnectorModal(null);
    setConnectorBusy(false);
  };

  const authorizePlatform = async (platformId: string) => {
    setConnectorBusy(true);
    // Real OAuth: redirect to provider. Backend stores connection and bounces back.
    if (OAUTH_PLATFORMS.includes(platformId) && idToken) {
      window.location.href = `/api/auth/${platformId}/authorize?token=${encodeURIComponent(idToken)}`;
      return;
    }
    // Simulated: mark as connected after a short delay
    setTimeout(() => {
      saveConnector(platformId, {
        connected: true,
        account: user?.email || 'connected',
        status: 'connected',
        lastSync: new Date().toISOString(),
      });
      setConnectorBusy(false);
      closeConnector();
    }, 900);
  };

  const disconnectPlatform = async (platformId: string) => {
    const next = { ...connectors };
    delete next[platformId];
    setConnectors(next);
    persistConnectorsLocal(next);
    closeConnector();
    if (!idToken) return;
    try {
      await fetch(`/api/connectors?platform=${platformId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      // Detach this source from every knowledge base so their graphs rebuild on
      // their own (the user disconnected it — it must no longer appear).
      await fetch('/api/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'purge-source', platform: platformId }),
      });
    } catch (e) { console.warn('Failed to disconnect:', e.message); }
  };

  // Clear any previous account's connectors the instant the token changes, then
  // load the current user's (prevents a cross-account flash/leak during the fetch).
  useEffect(() => { setConnectors({}); loadConnectors(idToken); }, [idToken]);

  // Lightweight knowledge-base list for the chat scope picker (id + name only).
  const loadKbList = async (token: string | null) => {
    if (!token) { setKbList([]); return; }
    try {
      const res = await fetch('/api/kb', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setKbList((data.kbs || []).map((k: { id: string; name: string }) => ({ id: k.id, name: k.name })));
      }
    } catch { /* ignore */ }
  };
  useEffect(() => { setSelectedKbId(null); loadKbList(idToken); }, [idToken]);

  // Returning from a real OAuth handshake: /?screen=integrations&connected=<provider>
  useEffect(() => {
    if (!idToken) return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    if (params.get('screen') === 'integrations') navigate('/integration');
    if (connected) {
      // OAuth complete — just reload connector state. No item selection step.
      loadConnectors(idToken);
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line
  }, [idToken]);

  const [editingMessageId, setEditingMessageId] = useState<number | string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const recentSends = useRef<number[]>([]);

  // Cloud Database Sync Helper
  const syncChatToDb = async (chatToSync: Chat, tokenToUse?: string | null) => {
    const tok = tokenToUse || idToken;
    if (!tok) return;
    try {
      await fetch('/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tok}`
        },
        body: JSON.stringify({ chat: chatToSync })
      });
    } catch (err) {
      console.error('Failed to sync chat to cloud:', err);
    }
  };

  // Firebase Auth State change listener
  useEffect(() => {
    // 1. Recover Admin Session if present
    const savedAdmin = localStorage.getItem('orgmind_admin_session');
    if (savedAdmin) {
      setAuthLoading(true);
      try {
        const parsed = JSON.parse(savedAdmin);
        setUser(parsed);
        setIdToken('admin-super-bypass-token-2026');

        // Load chats from MongoDB
        fetch('/api/chats', {
          headers: { 'Authorization': `Bearer admin-super-bypass-token-2026` }
        })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data) {
              setChats(data.chats || []);
              if (data.user) {
                setUser(prev => ({
                  ...prev,
                  role: data.user.role || prev?.role,
                  tier: data.user.tier || prev?.tier || 'ultra'
                } as User));
              }
            }
          })
          .catch(err => console.error(err))
          .finally(() => setAuthLoading(false));
      } catch (e) {
        console.error(e);
        setAuthLoading(false);
      }
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAuthLoading(true);
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken(true);
          setIdToken(token);
          setCookie('orgmind_auth_token', token, 7);

          // Load chats from MongoDB
          const chatsRes = await fetch('/api/chats', {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          let dbUser = null;
          if (chatsRes.ok) {
            const data = await chatsRes.json();
            setChats(data.chats || []);
            if (data.user) {
              dbUser = data.user;
            }
          }

          const isAdmin = currentUser.email === 'soumya@example.com' || currentUser.email === 'soumyadey.exe@gmail.com' || currentUser.email === 'soulsoumya1234@gmail.com';
          const newUserState: User = {
            uid: currentUser.uid,
            email: currentUser.email || '',
            name: currentUser.displayName || (currentUser.email || '').split('@')[0],
            avatar: currentUser.photoURL || '',
            role: dbUser?.role || (isAdmin ? 'admin' : 'user'),
            tier: dbUser?.tier || 'free',
          };
          setUser(newUserState);
          setCookie('orgmind_auth_user', JSON.stringify(newUserState), 7);
        } catch (err) {
          console.error('Failed to sync auth sessions:', err.message);
          setError('Failed to synchronize user session with database.');
        }
      } else {
        setUser(null);
        setIdToken(null);
        setChats([]);
        deleteCookie('orgmind_auth_user');
        deleteCookie('orgmind_auth_token');
        setActiveScreen('dashboard');
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const location = useLocation();

  // Handle protected routing redirects
  useEffect(() => {
    if (!user) {
      if (location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    } else {
      if (location.pathname === '/login') {
        navigate('/', { replace: true });
      }
    }
  }, [user, location.pathname, navigate]);

  // Admin Dashboard Actions
  const fetchAdminUsers = async () => {
    if (!idToken) return;
    setAdminLoading(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(adminSearch)}`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(data.users || []);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to fetch admin users');
      }
    } catch (err) {
      console.error(err);
      setError('Network error loading dashboard');
    } finally {
      setAdminLoading(false);
    }
  };

  const updateAdminUser = async (targetUid: string, tier: string, customHourLimit: number | null) => {
    if (!idToken) return;
    setAdminUpdatingUid(targetUid);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ targetUid, tier, customHourLimit })
      });
      if (res.ok) {
        await fetchAdminUsers();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to update user limits');
      }
    } catch (err) {
      console.error(err);
      setError('Network error saving changes');
    } finally {
      setAdminUpdatingUid(null);
    }
  };

  useEffect(() => {
    if (activeScreen === 'admin' && idToken) {
      fetchAdminUsers();
    }
  }, [activeScreen, adminSearch, idToken]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    setSearchSelectedIndex(0);
  }, [searchQuery]);

  const filteredChats = chats.filter(chat => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const matchesTitle = chat.title.toLowerCase().includes(q);
    const matchesMessage = chat.messages.some(m => m.content.toLowerCase().includes(q));
    return matchesTitle || matchesMessage;
  });

  const getChatDateGroupText = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) return 'Today';
    if (diffDays <= 2) return 'Yesterday';
    if (diffDays <= 7) return 'Past week';
    return 'Past month';
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchSelectedIndex(prev => (prev + 1) % filteredChats.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchSelectedIndex(prev => (prev - 1 + filteredChats.length) % filteredChats.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredChats[searchSelectedIndex]) {
        navigate(`/c/${filteredChats[searchSelectedIndex].id}`);
        setIsSearchOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsSearchOpen(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const currentChat = chats.find(c => c.id === currentChatId) || null;
  const messages = currentChat ? currentChat.messages : [];
  const chatGroups = groupChatsByDate(chats);

  useEffect(() => {
    document.title = 'hypr - Enterprise Knowledge Engine';
  }, []);

  // DevTools and Reverse-Engineering Protection Hook
  useEffect(() => {
    // Disable context menu (right click)
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);

    // Block F12, Ctrl+Shift+I/J/C, and Ctrl+U
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.keyCode === 123 || // F12
        (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) || // Ctrl+Shift+I/J/C
        (e.ctrlKey && e.keyCode === 85) // Ctrl+U (View Source)
      ) {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Detect DevTools by layout sizing delta
    const threshold = 160;
    const checkDevTools = () => {
      const widthDev = window.outerWidth - window.innerWidth > threshold;
      const heightDev = window.outerHeight - window.innerHeight > threshold;
      if (widthDev || heightDev) {
        window.location.reload();
      }
    };

    const interval = setInterval(checkDevTools, 500);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(interval);
    };
  }, []);

  // Close dropdown when clicking anywhere outside
  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    if (openMenuId) document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenuId]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('orgmind_chats', JSON.stringify(chats));
  }, [chats]);

  // Persist applications to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem('hs_applications', JSON.stringify(applications)); } catch { /* ignore */ }
  }, [applications]);

  // Sync activeScreen from URL path
  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith('/app')) setActiveScreen('applications');
    else if (p.startsWith('/kb')) setActiveScreen('knowledge');
    else if (p.startsWith('/integration')) setActiveScreen('integrations');
    else if (p === '/' || (!p.startsWith('/c') && !p.startsWith('/login'))) setActiveScreen('dashboard');
  }, [location.pathname]);

  // Sync activeAppId from URL param
  useEffect(() => {
    if (appId) {
      setActiveAppId(appId);
      const app = applications.find(a => a.id === appId);
      if (app) setAppSettingsForm({ systemPrompt: app.systemPrompt, model: app.model, temperature: app.temperature, maxTokens: app.maxTokens });
    } else if (location.pathname === '/app') {
      setActiveAppId(null);
    }
  }, [appId, location.pathname]);

  // Sync settings form whenever active app changes
  useEffect(() => {
    const app = applications.find(a => a.id === activeAppId);
    if (app) setAppSettingsForm({ systemPrompt: app.systemPrompt, model: app.model, temperature: app.temperature, maxTokens: app.maxTokens });
  }, [activeAppId]);

  // Scroll app playground messages to bottom
  useEffect(() => {
    appMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeAppId, appTab, appIsLoading]);

  // Sync active chat with localStorage & handle redirect/validation
  useEffect(() => {
    if (chatId) {
      if (chats.length > 0 && !chats.some(c => c.id === chatId)) {
        localStorage.removeItem('orgmind_current_chat_id');
        navigate('/', { replace: true });
      } else {
        localStorage.setItem('orgmind_current_chat_id', chatId);
      }
    }
  }, [chatId, navigate, chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading, currentChatId]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const createNewChat = () => {
    localStorage.removeItem('orgmind_current_chat_id');
    setIsSidebarOpen(false);
    navigate('/');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const deleteChat = async (id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) {
      localStorage.removeItem('orgmind_current_chat_id');
      navigate('/');
    }
    if (idToken) {
      try {
        await fetch(`/api/chats?id=${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
      } catch (err) {
        console.error('Failed to sync delete:', err);
      }
    }
  };

  const renameChat = async (id: string, newTitle: string) => {
    setChats(prev => prev.map(c => {
      if (c.id === id) {
        const updated = { ...c, title: newTitle };
        syncChatToDb(updated, idToken);
        return updated;
      }
      return c;
    }));
  };

  // ── Application CRUD ───────────────────────────────────────────────────────
  const createApp = () => {
    if (!newAppName.trim()) return;
    const newApp: Application = {
      id: generateId(),
      name: newAppName.trim(),
      description: newAppDesc.trim() || undefined,
      systemPrompt: 'You are a helpful AI assistant.',
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxTokens: 2048,
      linkedKbIds: [],
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setApplications(prev => [newApp, ...prev]);
    setNewAppName('');
    setNewAppDesc('');
    setShowCreateApp(false);
    setActiveAppId(newApp.id);
    setAppTab('playground');
  };

  const deleteApp = (id: string) => {
    setApplications(prev => prev.filter(a => a.id !== id));
    if (activeAppId === id) setActiveAppId(null);
  };

  const updateApp = (id: string, patch: Partial<Application>) => {
    setApplications(prev => prev.map(a =>
      a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a
    ));
  };

  const toggleAppKb = (appId: string, kbId: string) => {
    setApplications(prev => prev.map(a => {
      if (a.id !== appId) return a;
      const linked = a.linkedKbIds.includes(kbId)
        ? a.linkedKbIds.filter(id => id !== kbId)
        : [...a.linkedKbIds, kbId];
      return { ...a, linkedKbIds: linked, updatedAt: new Date().toISOString() };
    }));
  };

  // Send a message in the app playground (isolated per-app history + KB scope)
  const handleAppSend = async (appId: string) => {
    if (!appInput.trim() || appIsLoading) return;
    const app = applications.find(a => a.id === appId);
    if (!app) return;

    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      content: appInput.trim(),
      timestamp: new Date().toISOString(),
    };

    updateApp(appId, { messages: [...app.messages, userMsg] });
    setAppInput('');
    setAppIsLoading(true);
    setAppError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          message: userMsg.content,
          history: app.messages.map(m => ({ role: m.role, content: m.content })),
          model: app.model,
          kbId: app.linkedKbIds[0] || undefined,
          kbIds: app.linkedKbIds.length > 0 ? app.linkedKbIds : undefined,
          systemPrompt: app.systemPrompt,
          temperature: app.temperature,
          maxTokens: app.maxTokens,
        }),
      });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed'); }
      const data = await response.json();
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.response,
        reasoning: generateSarcasticReasoning(userMsg.content, data.response),
        timestamp: new Date().toISOString(),
      };
      // Re-fetch the latest app (state may have updated)
      setApplications(prev => prev.map(a =>
        a.id === appId
          ? { ...a, messages: [...a.messages.filter(m => m.id !== userMsg.id), userMsg, aiMsg], updatedAt: new Date().toISOString() }
          : a
      ));
    } catch (err: any) {
      setAppError(err.message);
    } finally {
      setAppIsLoading(false);
    }
  };

  const formatMessageTime = (timestamp: string | number) => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  };

  const copyUserMessage = (text: string, id: number | string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRetryUserMessage = (msg: Message) => {
    if (!currentChatId || isLoading) return;
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) return;
    const msgIndex = chat.messages.findIndex(m => m.id === msg.id);
    if (msgIndex === -1) return;
    const clearedHistory = chat.messages.slice(0, msgIndex);
    setChats(prev => prev.map(c => {
      if (c.id === currentChatId) {
        return {
          ...c,
          messages: clearedHistory,
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    }));
    setTimeout(() => {
      handleSendDirectlyWithHistory(msg.content, clearedHistory);
    }, 0);
  };

  const handleRetryAiMessage = (aiMsg: Message) => {
    if (!currentChatId || isLoading) return;
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) return;
    const msgIndex = chat.messages.findIndex(m => m.id === aiMsg.id);
    if (msgIndex === -1) return;
    let preMsgIndex = msgIndex - 1;
    while (preMsgIndex >= 0 && chat.messages[preMsgIndex].role !== 'user') {
      preMsgIndex--;
    }
    if (preMsgIndex === -1) return;
    handleRetryUserMessage(chat.messages[preMsgIndex]);
  };

  const handleRetryLastQuery = () => {
    if (!currentChatId || isLoading) return;
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat || chat.messages.length === 0) return;

    const lastMsg = [...chat.messages].reverse().find(m => m.role === 'user');
    if (!lastMsg) return;

    handleRetryUserMessage(lastMsg);
  };

  const handleEditUserMessage = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditingContent(msg.content);
  };

  const handleSaveEdit = (msg: Message, newText: string) => {
    if (!newText.trim() || isLoading || !currentChatId) return;
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) return;
    const msgIndex = chat.messages.findIndex(m => m.id === msg.id);
    if (msgIndex === -1) return;
    const clearedHistory = chat.messages.slice(0, msgIndex);
    setChats(prev => prev.map(c => {
      if (c.id === currentChatId) {
        return {
          ...c,
          messages: clearedHistory,
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    }));
    setTimeout(() => {
      handleSendDirectlyWithHistory(newText, clearedHistory);
    }, 0);
  };

  const handleSendDirectlyWithHistory = async (messageText: string, clearedHistory: Message[]) => {
    if (isLoading) return;
    const now = Date.now();
    recentSends.current = recentSends.current.filter(t => now - t < 60000);
    if (recentSends.current.length >= 5) {
      const waitSec = Math.ceil((60000 - (now - recentSends.current[0])) / 1000);
      setRateLimitMsg(`Slow down. Try again in ${waitSec}s.`);
      setTimeout(() => setRateLimitMsg(''), 3000);
      return;
    }
    recentSends.current.push(now);

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date().toISOString(),
    };

    setChats(prev => prev.map(c => {
      if (c.id === currentChatId) {
        const updated = {
          ...c,
          messages: [...clearedHistory, userMessage],
          updatedAt: new Date().toISOString()
        };
        syncChatToDb(updated, idToken);
        return updated;
      }
      return c;
    }));

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: clearedHistory.map(m => ({ role: m.role, content: m.content })),
          model: currentModel,
          kbId: selectedKbId || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to get response');
      }
      const data = await response.json();

      const aiMessage: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.response,
        reasoning: generateSarcasticReasoning(userMessage.content, data.response),
        timestamp: new Date().toISOString(),
      };

      setChats(prev => prev.map(c => {
        if (c.id === currentChatId) {
          const updated = {
            ...c,
            messages: [...clearedHistory, userMessage, aiMessage],
            updatedAt: new Date().toISOString(),
            title: data.title ? data.title : c.title
          };
          syncChatToDb(updated, idToken);
          return updated;
        }
        return c;
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      if (window.innerWidth >= 768) inputRef.current?.focus();
    }
  };

  const clearAllChats = () => {
    setClearAllModal(true);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Rate limit: max 5 messages per 60 seconds
    const now = Date.now();
    recentSends.current = recentSends.current.filter(t => now - t < 60000);
    if (recentSends.current.length >= 5) {
      const waitSec = Math.ceil((60000 - (now - recentSends.current[0])) / 1000);
      setRateLimitMsg(`Slow down. Try again in ${waitSec}s.`);
      setTimeout(() => setRateLimitMsg(''), 3000);
      return;
    }
    recentSends.current.push(now);

    let chatId = currentChatId;
    let isNewChat = false;

    if (!chatId) {
      const words = input.trim().split(/\s+/).slice(0, 5).join(' ');
      const autoTitle = words.length > 0 ? (words + (input.trim().split(/\s+/).length > 5 ? '…' : '')) : 'New Chat';
      const newId = generateId();
      const newChat: Chat = {
        id: newId,
        title: autoTitle,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setChats(prev => [newChat, ...prev]);
      chatId = newId;
      navigate(`/c/${newId}`, { replace: true });
      isNewChat = true;
    }

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        const updated = {
          ...c,
          messages: [...c.messages, userMessage],
          updatedAt: new Date().toISOString(),
          title: (c.messages.length === 0 && isNewChat)
            ? userMessage.content.slice(0, 30) + (userMessage.content.length > 30 ? '...' : '')
            : c.title
        };
        syncChatToDb(updated, idToken);
        return updated;
      }
      return c;
    }));

    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const currentMessages = chats.find(c => c.id === chatId)?.messages || [];
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: currentMessages.map(m => ({ role: m.role, content: m.content })),
          model: currentModel,
          kbId: selectedKbId || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to get response');
      }
      const data = await response.json();

      const aiMessage: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.response,
        reasoning: generateSarcasticReasoning(userMessage.content, data.response),
        timestamp: new Date().toISOString(),
      };

      setChats(prev => prev.map(c => {
        if (c.id === chatId) {
          const updated = {
            ...c,
            messages: [...c.messages, aiMessage],
            updatedAt: new Date().toISOString(),
            title: data.title ? data.title : c.title
          };
          syncChatToDb(updated, idToken);
          return updated;
        }
        return c;
      }));

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      if (window.innerWidth >= 768) inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string, id: number | string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportChat = () => {
    if (!currentChat) return;
    const text = currentChat.messages.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${currentChat.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderSidebarContent = () => (
    <div className={`flex flex-col h-full font-basel bg-[#252523] border-r border-[#3D3A37] overflow-hidden`}>
      <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-5 py-3'}`}>
        {!isSidebarCollapsed && (
          <div className="flex items-center gap-2.5 cursor-pointer h-7">
            <img src="/particles.png" className="w-[22px] h-[22px] rounded object-contain shrink-0" alt="logo" />
            <h1 className="text-[22px] font-martina font-light tracking-tight text-[#F4F0EB] leading-none translate-y-[1px]">hypr</h1>
          </div>
        )}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hover:bg-[#3D3A37] p-1 rounded text-[#8C8880] hover:text-[#F4F0EB] transition-colors hidden lg:flex items-center justify-center shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
        </button>
      </div>

      {/* Primary navigation */}
      <div className={`flex flex-col gap-0.5 ${isSidebarCollapsed ? 'mt-4 items-center' : 'px-3 mt-1'}`}>
        {([
          { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, path: '/' },
          { id: 'applications', label: 'Applications', Icon: LayoutGrid, path: '/app' },
          { id: 'knowledge', label: 'Knowledge', Icon: Database, path: '/kb' },
          { id: 'integrations', label: 'Integrations', Icon: Blocks, path: '/integration' },
        ] as const).map(({ id, label, Icon, path }) => {
          const active = activeScreen === id;
          return (
            <button
              key={id}
              onClick={() => { setActiveScreen(id); navigate(path); setIsSidebarOpen(false); }}
              title={label}
              className={`flex items-center rounded-lg transition-colors ${isSidebarCollapsed ? 'justify-center p-2' : 'gap-3 px-2.5 py-2'} ${active ? 'bg-[#3D3A37] text-[#F4F0EB]' : 'text-[#A8A39B] hover:text-[#F4F0EB] hover:bg-[#2E2C2A]'}`}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <Icon size={18} strokeWidth={active ? 2.2 : 2} />
              </div>
              {!isSidebarCollapsed && <span className="text-[14px] leading-[20px] whitespace-nowrap font-geist font-medium tracking-tight">{label}</span>}
            </button>
          );
        })}
      </div>

      {!isSidebarCollapsed && <div className="mx-4 my-3 h-px bg-[#33302E]" />}

      {isSidebarCollapsed ? (
        <div className="flex flex-col gap-1 items-center mt-1">
          <button
            onClick={() => createNewChat()}
            className="flex items-center justify-center p-2 rounded-lg text-[#A8A39B] hover:text-[#F4F0EB] hover:bg-[#3D3A37] transition-colors"
            title="New chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14l4-4h6" /><line x1="16" y1="21" x2="22" y2="21" /><line x1="19" y1="18" x2="19" y2="24" /></svg>
          </button>
          <button
            onClick={() => { setIsSearchOpen(true); setSearchQuery(''); }}
            className="flex items-center justify-center p-2 rounded-lg text-[#A8A39B] hover:text-[#F4F0EB] hover:bg-[#3D3A37] transition-colors"
            title="Search chats"
          >
            <Search size={18} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <div className="px-4 mt-1 flex items-center justify-between">
          <span className="text-[11px] font-geist font-semibold uppercase tracking-[0.12em] text-[#8C8880]">Chats</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => { setIsSearchOpen(true); setSearchQuery(''); }}
              className="p-1.5 rounded-md text-[#8C8880] hover:text-[#F4F0EB] hover:bg-[#3D3A37] transition-colors"
              title="Search chats"
            >
              <Search size={16} strokeWidth={2} />
            </button>
            <button
              onClick={() => createNewChat()}
              className="p-1.5 rounded-md text-[#8C8880] hover:text-[#F4F0EB] hover:bg-[#3D3A37] transition-colors"
              title="New chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14l4-4h6" /><line x1="16" y1="21" x2="22" y2="21" /><line x1="19" y1="18" x2="19" y2="24" /></svg>
            </button>
          </div>
        </div>
      )}


      {!isSidebarCollapsed && (
        <div className="flex-1 overflow-y-auto px-3 mt-2 space-y-6 scrollbar-thin">
          {Object.entries(chatGroups).map(([group, groupChats]) => (
            groupChats.length > 0 && (
              <div key={group}>
                <h3 className="text-[11px] font-normal text-[#8C8880] mb-2 px-2 uppercase tracking-widest">
                  {group === 'today' ? 'Today' : group === 'yesterday' ? 'Yesterday' : group === 'last7Days' ? 'Previous 7 Days' : 'Older'}
                </h3>
                <div className="space-y-0.5">
                  {groupChats.map((chat, idx) => {
                    const IconLetter = idx % 3 === 0 ? 'M' : idx % 3 === 1 ? 'A' : 'M';
                    const isActive = chat.id === currentChatId;
                    return (
                      <div
                        key={chat.id}
                        className={`group relative flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${isActive ? 'bg-[#3D3A37]' : 'hover:bg-[#2E2C2A]'}`}
                        onClick={() => { navigate(`/c/${chat.id}`); setIsSidebarOpen(false); }}
                      >


                        {/* Title */}
                        <span className="truncate text-[14px] leading-[20px] font-normal font-basel text-[#F4F0EB] flex-1">{chat.title}</span>

                        {/* 3-dots button - visible on hover */}
                        <div className="relative" onClick={e => e.stopPropagation()}>
                          <button
                            id={`menu-btn-${chat.id}`}
                            onClick={() => setOpenMenuId(openMenuId === chat.id ? null : chat.id)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#403E3C] text-[#8C8880] hover:text-[#F4F0EB] transition-all"
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {/* Dropdown */}
                          {openMenuId === chat.id && (
                            <div className="absolute right-0 top-6 z-50 bg-[#2A2826] border border-[#403E3C] rounded-lg shadow-xl overflow-hidden min-w-[130px]">
                              <button
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setRenameModal({ chatId: chat.id, currentTitle: chat.title });
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-basel text-[#F4F0EB] hover:bg-[#3D3A37] transition-colors text-left"
                              >
                                <Edit2 size={13} className="text-[#8C8880]" />
                                Rename
                              </button>
                              <button
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDeleteModal({ chatId: chat.id });
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-basel text-red-400 hover:bg-[#3D3A37] transition-colors text-left"
                              >
                                <Trash2 size={13} className="text-red-400" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {isSidebarCollapsed && <div className="flex-1"></div>}

      <div className="mt-auto flex flex-col border-t border-[#3D3A37]">
        {/* Profile Details */}
        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center py-3' : 'justify-between px-4 py-3'}`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center w-full' : 'gap-3 min-w-0'}`}>
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt="Avatar"
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover shrink-0 border border-[#57534E]"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = 'none';
                  const fallback = img.nextSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-7 h-7 rounded-full bg-[#3D3A37] border border-[#57534E] flex items-center justify-center text-[#F4F0EB] text-[11.5px] font-bold uppercase shrink-0 select-none font-basel"
              style={{ display: user?.avatar ? 'none' : 'flex' }}
            >
              {user?.name ? user.name.charAt(0) : 'U'}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold text-[#F4F0EB] truncate">{user?.name}</span>
                <span className="text-[10px] text-[#8C8880] truncate">
                  {user?.role === 'admin'
                    ? 'Administrator'
                    : user?.tier === 'ultra'
                      ? 'Ultra Account'
                      : user?.tier === 'pro'
                        ? 'Pro Account'
                        : 'Free Account'}
                </span>
              </div>
            )}
          </div>

          {!isSidebarCollapsed && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="text-[#8C8880] hover:text-[#F4F0EB] p-1 rounded hover:bg-[#3D3A37] transition-all cursor-pointer"
                title="Settings"
              >
                <SettingsIcon size={14} />
              </button>
              <button
                onClick={handleLogout}
                className="text-[#8C8880] hover:text-[#F4F0EB] p-1 rounded hover:bg-[#3D3A37] transition-all cursor-pointer"
                title="Sign Out"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Admin Navigation Overlay - only shown for admins */}
        {!isSidebarCollapsed && user?.role === 'admin' && (
          <div className="px-3 pb-3">
            <button
              onClick={() => { if (activeScreen === 'admin') { setActiveScreen('dashboard'); navigate('/'); } else setActiveScreen('admin'); }}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded-[8px] bg-[#3D3A37] hover:bg-[#4A4744] text-[#F4F0EB] text-[12px] font-bold transition-all cursor-pointer border border-[#57534E]"
            >
              <Shield size={12} className="text-amber-400" />
              <span>{activeScreen === 'admin' ? 'Back to Chat' : 'Admin Panel'}</span>
            </button>
          </div>
        )}

        <div className={`border-t border-[#3D3A37] flex ${isSidebarCollapsed ? 'justify-center py-3' : 'px-4 py-3 justify-between text-[10px] leading-[15px] font-normal font-basel text-[#E7E1DA]'}`}>
          {isSidebarCollapsed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#8C8880] hover:text-[#F4F0EB] transition-colors"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
          ) : (
            <>
              <button onClick={() => setActiveDocModal('terms')} className="hover:text-white transition-colors bg-transparent border-none p-0 cursor-pointer text-[10px] leading-[15px] font-basel text-[#E7E1DA] font-normal">Terms of Use</button>
              <button onClick={() => setActiveDocModal('privacy')} className="hover:text-white transition-colors bg-transparent border-none p-0 cursor-pointer text-[10px] leading-[15px] font-basel text-[#E7E1DA] font-normal">Privacy Policy</button>
              <button onClick={() => setShowCookieConsent(true)} className="hover:text-white transition-colors bg-transparent border-none p-0 cursor-pointer text-[10px] leading-[15px] font-basel text-[#E7E1DA] font-normal">Cookies</button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderInputBox = () => {
    return (
    <div className="relative flex flex-col bg-[#33302E] px-5 pt-5 pb-4 rounded-[16px] shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-colors duration-200" style={{ minHeight: '120px' }}>
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything..."
        disabled={isLoading}
        rows={1}
        className="w-full bg-transparent font-basel text-[15px] placeholder:text-[#6B6762] focus:outline-none resize-none overflow-y-auto text-[#F4F0EB] leading-relaxed flex-1"
        style={{ height: 'auto', minHeight: '52px' }}
        onInput={(e) => {
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 200) + 'px';
        }}
      />
      <div className="flex items-center justify-end mt-4">
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="w-7 h-7 flex items-center justify-center bg-transparent border border-[#57534E] hover:bg-[#403E3C] text-[#8C8880] hover:text-[#F4F0EB] rounded-[8px] transition-all disabled:opacity-30"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </button>
      </div>
    </div>
    );
  };


  // Prefill from dashboard / KB hub — navigate to applications list.
  const onAskFromHub = (_text: string) => {
    navigate('/app');
  };

  const renderIntegrations = () => {
    const connectedCount = PLATFORMS.filter(p => connectors?.[p.id]?.connected).length;
    return (
      <div className="flex-1 overflow-y-auto bg-[#252523] font-geist animate-fade-in">
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-8 lg:py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
            <div>
              <h1 className="text-[30px] lg:text-[34px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-none">Integrations</h1>
              <p className="text-[13.5px] font-geist text-[#8C8880] mt-2">Authorize platforms for hypr to access. {connectedCount} of {PLATFORMS.length} connected.</p>
            </div>
            <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] text-[12px] font-geist font-medium text-[#C7C2BC]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#8FAE97' }} />
              {connectedCount} platform{connectedCount !== 1 ? 's' : ''} connected
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLATFORMS.map((p) => {
              const c = connectors?.[p.id];
              const connected = c?.connected;
              const comingSoon = COMING_SOON_PLATFORMS.includes(p.id);
              const lastSync = c?.lastSync ? new Date(c.lastSync).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
              return (
                <div key={p.id} className={`card-elev rounded-2xl p-5 flex flex-col gap-4 ${comingSoon ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between">
                    <span className="w-11 h-11 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center">
                      {platformIcon(p, 20)}
                    </span>
                    {comingSoon ? (
                      <span className="text-[11px] font-geist font-semibold text-[#C9A66B] bg-[#2A2318] border border-[#5A4A28] px-2 py-1 rounded-md uppercase tracking-wide">Coming Soon</span>
                    ) : connected ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-geist font-medium text-[#8FAE97] bg-[#1A2A1E] border border-[#2E4636] px-2 py-1 rounded-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#8FAE97] animate-pulse" />
                        Connected
                      </span>
                    ) : (
                      <span className="text-[11px] font-geist font-medium text-[#8C8880] bg-[#1E1D1C] border border-[#3D3A37] px-2 py-1 rounded-md">Not connected</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[16px] font-geist font-semibold text-[#F4F0EB] tracking-tight">{p.name}</h3>
                    <p className="text-[12.5px] font-geist text-[#8C8880] mt-1 leading-relaxed line-clamp-2 min-h-[36px]">
                      {comingSoon
                        ? 'Support for this platform is coming soon.'
                        : connected
                          ? `Authorized${lastSync ? ` · last connected ${lastSync}` : ''}`
                          : p.authBlurb.split('.')[0] + '.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {!comingSoon && !connected && (
                      <button onClick={() => openConnector(p.id)} className="btn-bump btn-bump-accent flex-1 py-2.5 text-[12.5px]">
                        Connect <ArrowRight size={14} />
                      </button>
                    )}
                    {comingSoon && (
                      <button disabled className="btn-bump flex-1 py-2.5 text-[12.5px] opacity-40 cursor-not-allowed bg-[#1E1D1C] border border-[#3D3A37] text-[#8C8880] rounded-xl">
                        Coming Soon
                      </button>
                    )}
                    {connected && (
                      <button onClick={() => disconnectPlatform(p.id)} className="flex-1 px-3 py-2.5 rounded-xl border border-[#3D3A37] text-[12px] font-geist font-medium text-[#BFA39C] hover:text-[#C28379] hover:bg-[rgba(194,131,121,0.08)] transition-colors">
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };


  const renderAdminDashboard = () => (
    <div className="flex-1 flex flex-col h-full bg-[#252523] text-[#f5f5f5] font-basel overflow-y-auto p-6 md:p-8 animate-fade-in">
      {/* Editorial Header */}
      <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-6 mb-10">
        <h2 className="text-[20px] font-martina-light uppercase text-[#f5f5f5] tracking-tight select-none">hypr Admin</h2>
        <button
          onClick={() => { setActiveScreen('dashboard'); navigate('/'); }}
          className="px-4 py-2 bg-transparent border border-[#1f1f1f] hover:border-[#f5f5f5] text-[#f5f5f5] rounded-[4px] text-[11px] uppercase tracking-[0.12em] font-semibold transition-all cursor-pointer font-basel"
        >
          Back
        </button>
      </div>

      {/* Stats Cards Row (Editorial Pull-Quotes Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10 select-none">
        <div className="bg-transparent border border-[#1f1f1f] rounded-[4px] p-6 flex flex-col justify-between hover:border-[#2a2a2a] transition-colors duration-300">
          <span className="text-[#6b6b6b] text-[10px] uppercase tracking-[0.15em] font-medium font-basel">Total Users</span>
          <div className="flex items-baseline mt-4">
            <h3 className="font-martina-light text-[2.8rem] leading-none text-[#f5f5f5] font-light">
              {adminUsers.length}
            </h3>
          </div>
        </div>
        <div className="bg-transparent border border-[#1f1f1f] rounded-[4px] p-6 flex flex-col justify-between hover:border-[#2a2a2a] transition-colors duration-300">
          <span className="text-[#6b6b6b] text-[10px] uppercase tracking-[0.15em] font-medium font-basel">Pro Subscribers</span>
          <div className="flex items-baseline mt-4">
            <h3 className="font-martina-light text-[2.8rem] leading-none text-[#f5f5f5] font-light">
              {adminUsers.filter(u => u.tier === 'pro').length}
            </h3>
          </div>
        </div>
        <div className="bg-transparent border border-[#1f1f1f] rounded-[4px] p-6 flex flex-col justify-between hover:border-[#2a2a2a] transition-colors duration-300">
          <span className="text-[#6b6b6b] text-[10px] uppercase tracking-[0.15em] font-medium font-basel">Active Usage (1h)</span>
          <div className="flex items-baseline mt-4">
            <h3 className="font-martina-light text-[2.8rem] leading-none text-[#f5f5f5] font-light">
              {adminUsers.reduce((sum, u) => sum + (u.hourlyUsage || 0), 0)}
            </h3>
          </div>
        </div>
      </div>

      {/* Search & Actions Control Row */}
      <div className="flex gap-4 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b6b6b]" size={14} />
          <input
            type="text"
            placeholder="SEARCH USERS BY EMAIL OR NAME..."
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            className="w-full bg-transparent border border-[#1f1f1f] focus:border-[#6b6b6b] rounded-[4px] pl-10 pr-4 py-2.5 text-[12px] uppercase tracking-[0.06em] text-[#f5f5f5] placeholder:text-[#6b6b6b] outline-none transition-all font-basel"
          />
        </div>
        <button
          onClick={fetchAdminUsers}
          className="px-5 py-2.5 bg-transparent border border-[#1f1f1f] hover:border-[#f5f5f5] text-[#f5f5f5] rounded-[4px] text-[11px] uppercase tracking-[0.12em] font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-2 font-basel"
        >
          <RefreshCw size={12} className={adminLoading ? "animate-spin text-[#6b6b6b]" : "text-[#6b6b6b]"} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Table Container */}
      <div className="bg-transparent border border-[#1f1f1f] rounded-[4px] overflow-hidden flex-1 flex flex-col min-h-[400px]">
        {adminLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 select-none">
            <RefreshCw className="animate-spin text-[#6b6b6b] mb-3" size={20} />
            <span className="text-[#6b6b6b] text-[11px] uppercase tracking-[0.12em] font-medium font-basel">Retrieving Quotas...</span>
          </div>
        ) : adminUsers.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-20 text-[#6b6b6b] text-[12px] uppercase tracking-[0.12em] font-medium font-basel select-none">
            No users registered or matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-basel">
              <thead>
                <tr className="border-b border-[#1f1f1f] text-[10px] font-bold text-[#6b6b6b] uppercase tracking-[0.15em] select-none bg-transparent">
                  <th className="px-6 py-4.5">User</th>
                  <th className="px-6 py-4.5">Tier / Billing</th>
                  <th className="px-6 py-4.5">Custom Limit</th>
                  <th className="px-6 py-4.5">Recent Usage</th>
                  <th className="px-6 py-4.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f]">
                {adminUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-[#161616] text-[13px] transition-colors duration-200">
                    {/* User Profile */}
                    <td className="px-6 py-4 flex items-center gap-3">
                      {u.avatar ? (
                        <img
                          src={u.avatar}
                          className="w-7 h-7 rounded-full border border-[#1f1f1f] object-cover"
                          referrerPolicy="no-referrer"
                          alt="avatar"
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.style.display = 'none';
                            const fallback = img.nextSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="w-7 h-7 rounded-full bg-[#161616] border border-[#1f1f1f] flex items-center justify-center text-[#f5f5f5] text-[10.5px] font-bold uppercase shrink-0 select-none font-basel"
                        style={{ display: u.avatar ? 'none' : 'flex' }}
                      >
                        {u.name ? u.name.charAt(0) : 'U'}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[#f5f5f5] truncate leading-normal">{u.name}</span>
                        <span className="text-[#6b6b6b] text-[11px] truncate leading-normal mt-0.5">{u.email}</span>
                      </div>
                    </td>

                    {/* Tier Selection */}
                    <td className="px-6 py-4">
                      <select
                        value={u.tier}
                        onChange={(e) => updateAdminUser(u.uid, e.target.value, u.customHourLimit)}
                        disabled={adminUpdatingUid === u.uid}
                        className="bg-transparent border border-[#1f1f1f] hover:border-[#f5f5f5] text-[#f5f5f5] rounded-[4px] px-3 py-1.5 text-[12px] cursor-pointer transition-all font-basel outline-none min-w-[170px]"
                      >
                        <option value="free" className="bg-[#252523] text-[#f5f5f5] font-basel">Free Tier (10/hr)</option>
                        <option value="pro" className="bg-[#252523] text-[#f5f5f5] font-basel">Pro Tier (150/hr)</option>
                        <option value="ultra" className="bg-[#252523] text-[#f5f5f5] font-basel">Ultra Tier (Unlimited)</option>
                      </select>
                    </td>

                    {/* Custom hourly limit input */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Default"
                          value={u.customHourLimit !== null ? u.customHourLimit : ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            updateAdminUser(u.uid, u.tier, val);
                          }}
                          disabled={adminUpdatingUid === u.uid}
                          className="w-20 bg-transparent border border-[#1f1f1f] text-[#f5f5f5] rounded-[4px] px-3 py-1.5 text-center text-[12px] outline-none focus:border-[#6b6b6b] hover:border-[#6b6b6b]/50 transition-all font-basel"
                        />
                        {u.customHourLimit !== null && (
                          <button
                            onClick={() => updateAdminUser(u.uid, u.tier, null)}
                            className="text-[#6b6b6b] hover:text-[#f5f5f5] text-[10px] hover:underline cursor-pointer select-none font-bold transition-colors bg-transparent border-none p-0"
                            title="Clear custom override"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Usage counts */}
                    <td className="px-6 py-4 select-none">
                      <div className="flex items-center gap-1.5 font-basel text-[13px] text-[#f5f5f5]">
                        <span className="font-semibold">
                          {u.hourlyUsage}
                        </span>
                        <span className="text-[#6b6b6b]">
                          / {u.customHourLimit !== null ? u.customHourLimit : (u.tier === 'pro' ? 150 : u.tier === 'ultra' ? '∞' : 10)} MSGS (HR)
                        </span>
                      </div>
                    </td>

                    {/* Update status action column */}
                    <td className="px-6 py-4 select-none">
                      {adminUpdatingUid === u.uid ? (
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#6b6b6b] animate-pulse" />
                          <span className="text-[#6b6b6b] text-[11px] uppercase tracking-[0.1em] font-medium font-basel animate-pulse">Syncing</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#f5f5f5]" />
                          <span className="text-[#6b6b6b] text-[11px] uppercase tracking-[0.1em] font-medium font-basel">Active</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );



  if (!user) {
    if (location.pathname !== '/login') {
      return null;
    }
    const handleAuthSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (authMode === 'login') {
        handleEmailLogin();
      } else if (authMode === 'signup') {
        handleEmailSignUp();
      } else {
        handleForgotPassword();
      }
    };

    return (
      <div className="h-screen w-screen flex flex-row bg-[#252523] p-4 lg:p-5 select-none font-basel overflow-hidden relative text-[#F4F0EB]">

        {/* Left Side: Form Container */}
        <div className="flex-1 h-full flex flex-col justify-between py-4 px-6 lg:px-12 overflow-hidden bg-[#252523]">

          {/* Top Logo branding */}
          <div className="flex items-center gap-2.5 select-none self-start h-8">
            <img src="/particles.png" className="w-8 h-8 rounded-lg object-contain bg-[#33302E] border border-[#403E3C] shadow-sm p-1 shrink-0" alt="hypr" />
            <span className="text-[18px] font-martina font-bold tracking-tight text-[#F4F0EB] leading-none translate-y-[1px]">hypr</span>
          </div>

          {/* Center Form Card */}
          <div className="w-full max-w-[400px] mx-auto flex flex-col my-auto py-2 animate-fade-in">

            {/* Titles */}
            <div className="flex flex-col text-left select-none mb-6">
              <h1 className="text-[32px] font-martina font-light text-[#FFFFFE] tracking-tight">
                {authMode === 'login' ? 'Welcome Back' : authMode === 'signup' ? 'Register Now' : 'Recover Account'}
              </h1>
              <p className="text-[#8C8880] text-[13.5px] mt-2 leading-relaxed">
                {authMode === 'login' ? 'Enter your email and password to access your account.' : authMode === 'signup' ? 'Create a secure client session to unlock the cloud chat pipeline.' : 'Enter your registered email below to receive a secure recovery linkage.'}
              </p>
            </div>

            {/* Email + Password Form */}
            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4 w-full">

              {/* Email Address */}
              <div className="flex flex-col gap-1.5 w-full relative">
                <label className="text-[11px] font-bold text-[#8C8880] uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="your-email@example.com"
                  className="w-full bg-[#33302E] border border-[#403E3C] rounded-[8px] px-4 py-3 text-[14px] text-[#F4F0EB] placeholder:text-[#8C8880] focus:border-[#F4F0EB] focus:ring-1 focus:ring-[#F4F0EB]/10 outline-none transition-all shadow-sm font-basel"
                  required
                />
              </div>

              {/* Password */}
              {authMode !== 'forgot' && (
                <div className="flex flex-col gap-1.5 w-full relative">
                  <label className="text-[11px] font-bold text-[#8C8880] uppercase tracking-wider">Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-[#33302E] border border-[#403E3C] rounded-[8px] px-4 py-3 pr-12 text-[14px] text-[#F4F0EB] placeholder:text-[#8C8880] focus:border-[#F4F0EB] focus:ring-1 focus:ring-[#F4F0EB]/10 outline-none transition-all shadow-sm font-basel"
                    required
                  />

                  {/* Eye Toggle button inside Password field */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-9.5 text-[#8C8880] hover:text-[#F4F0EB] focus:outline-none transition-colors"
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    )}
                  </button>
                </div>
              )}

              {/* Bottom Options (Remember Me & Forgot link) */}
              {authMode !== 'forgot' && (
                <div className="flex items-center justify-between mt-1 select-none text-[13px]">

                  {/* Remember Me Checkbox */}
                  <label className="flex items-center gap-2 text-[#8C8880] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={() => setRememberMe(!rememberMe)}
                      className="w-4 h-4 rounded border-[#403E3C] bg-[#33302E] text-[#F4F0EB] focus:ring-[#F4F0EB]/10 cursor-pointer"
                    />
                    <span>Remember Me</span>
                  </label>

                  {/* Forgot link */}
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); setAuthError(''); setAuthSuccessMsg(''); }}
                    className="text-[#E7E1DA] hover:text-[#F4F0EB] font-bold transition-all cursor-pointer bg-transparent border-none p-0 hover:underline"
                  >
                    Forgot Your Password?
                  </button>
                </div>
              )}

              {/* Primary Submit Button */}
              <button
                type="submit"
                disabled={authFormLoading}
                className="w-full py-3 bg-[#EBE9E2] hover:bg-white disabled:bg-[#3D3A37] disabled:text-[#8C8880] text-[#252523] font-bold text-[14px] rounded-[8px] transition-all cursor-pointer shadow-sm mt-4 flex items-center justify-center gap-2 select-none font-basel"
              >
                {authFormLoading ? (
                  <RefreshCw className="animate-spin text-[#252523]" size={16} />
                ) : authMode === 'login' ? (
                  'Log In'
                ) : authMode === 'signup' ? (
                  'Register'
                ) : (
                  'Send Reset Link'
                )}
              </button>

              {/* OR Line Separator */}
              <div className="flex items-center gap-4 my-3 w-full select-none">
                <div className="h-[1px] bg-[#403E3C] flex-1" />
                <span className="text-[10px] font-bold text-[#8C8880] uppercase tracking-widest font-basel">Or Login With</span>
                <div className="h-[1px] bg-[#403E3C] flex-1" />
              </div>

              {/* Social Login Row */}
              <div className="flex gap-4 w-full">
                {/* Google Button */}
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-[8px] bg-[#33302E] border border-[#403E3C] hover:bg-[#403E3C] text-[#F4F0EB] font-bold text-[13.5px] transition-all duration-300 shadow-sm cursor-pointer select-none font-basel"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Google</span>
                </button>

                {/* Apple Button */}
                <button
                  type="button"
                  onClick={() => alert('Apple Authentication features are launching in the next release!')}
                  className="flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-[8px] bg-[#33302E] border border-[#403E3C] hover:bg-[#403E3C] text-[#F4F0EB] font-bold text-[13.5px] transition-all duration-300 shadow-sm cursor-pointer select-none font-basel"
                >
                  <svg className="w-5 h-5 shrink-0 fill-current text-[#F4F0EB]" viewBox="0 0 24 24">
                    <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.1 16.67C20.08 16.74 19.67 18.11 18.71 19.5M15.97 4.17C16.63 3.37 17.07 2.28 16.95 1C15.85 1.04 14.51 1.73 13.73 2.64C13.07 3.41 12.49 4.52 12.64 5.78C13.87 5.87 15.12 5.17 15.97 4.17Z" />
                  </svg>
                  <span>Apple</span>
                </button>
              </div>

              {/* Status Alerts */}
              {authError && (
                <div className="text-red-400 text-[12px] text-center font-medium bg-red-950/20 border border-red-900/30 rounded-[8px] px-3.5 py-2.5 w-full animate-fade-in leading-relaxed select-none font-basel">
                  {authError}
                </div>
              )}
              {authSuccessMsg && (
                <div className="text-green-400 text-[12px] text-center font-medium bg-green-950/20 border border-green-900/30 rounded-[8px] px-3.5 py-2.5 w-full animate-fade-in leading-relaxed select-none font-basel">
                  {authSuccessMsg}
                </div>
              )}

            </form>

            {/* Footer switcher links */}
            <p className="text-center text-[13px] text-[#8C8880] mt-8 select-none font-basel">
              {authMode === 'login' ? (
                <>
                  Don&apos;t Have An Account?{' '}
                  <button
                    type="button"
                    onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthSuccessMsg(''); }}
                    className="text-[#F4F0EB] hover:text-white font-bold bg-transparent border-none p-0 cursor-pointer hover:underline"
                  >
                    Register Now.
                  </button>
                </>
              ) : authMode === 'signup' ? (
                <>
                  Already Have An Account?{' '}
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccessMsg(''); }}
                    className="text-[#F4F0EB] hover:text-white font-bold bg-transparent border-none p-0 cursor-pointer hover:underline"
                  >
                    Log In.
                  </button>
                </>
              ) : (
                <>
                  Remember your details?{' '}
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccessMsg(''); }}
                    className="text-[#F4F0EB] hover:text-white font-bold bg-transparent border-none p-0 cursor-pointer hover:underline"
                  >
                    Back to log in
                  </button>
                </>
              )}
            </p>

          </div>

          {/* Bottom Copyright Text */}
          <div className="flex justify-between w-full text-[11px] text-[#8C8880] mt-auto pt-4 border-t border-[#403E3C]/50 select-none font-basel">
            <span>Copyright &copy; 2026 hypr LTD.</span>
            <a href="#privacy" className="hover:text-[#F4F0EB] transition-colors hover:underline">Privacy Policy</a>
          </div>

        </div>

        {/* Right Side: Elegant Editorial Hero Panel */}
        <div className="hidden md:flex md:w-[48%] lg:w-[50%] h-full rounded-[12px] bg-[#1E1D1C] border border-[#3D3A37] relative flex-col items-center justify-center p-12 text-white shrink-0 overflow-hidden shadow-xl">

          {/* Structural Editorial Grid Pattern */}
          <div
            className="absolute inset-0 bg-[linear-gradient(to_right,#3D3A37_1px,transparent_1px),linear-gradient(to_bottom,#3D3A37_1px,transparent_1px)] bg-[size:48px_48px] opacity-[0.08] pointer-events-none z-0"
            style={{
              maskImage: 'radial-gradient(circle at center, black 40%, transparent 90%)',
              WebkitMaskImage: 'radial-gradient(circle at center, black 40%, transparent 90%)'
            }}
          />

          {/* Top text content overlay */}
          <div className="relative z-10 text-center max-w-[420px] mb-12 select-none flex flex-col gap-3 animate-fade-in">
            <h2 className="text-[28px] lg:text-[34px] font-martina-light font-light leading-tight tracking-tight text-[#FFFFFE]">
              Effortlessly chat with uncensored intelligence.
            </h2>
            <p className="text-[#8C8880] text-[13.5px] lg:text-[14px] leading-relaxed px-4 font-basel">
              Log in to access your premium uncensored chat pipeline, manage custom models, and synchronize conversations across your devices.
            </p>
          </div>

          {/* Centered Mockup Card */}
          <div className="w-full max-w-[400px] bg-[#252523] border border-[#3D3A37] rounded-[12px] p-5 shadow-2xl relative z-10 select-none flex flex-col gap-4">

            {/* Mockup Header bar */}
            <div className="flex items-center justify-between border-b border-[#3D3A37] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[11px] font-bold text-[#F4F0EB] tracking-wide font-basel">hypr</span>
              </div>
              <span className="text-[9px] text-[#8C8880] font-bold uppercase tracking-[0.08em] font-basel">Model: OM-3.0</span>
            </div>

            {/* Chat Mockup messages */}
            <div className="flex flex-col gap-3 select-none font-basel h-[190px] overflow-y-auto scroll-smooth pr-1 custom-scrollbar">
              {/* User message */}
              {mockStep >= 1 && (
                <div className="self-end max-w-[85%] bg-[#3A3735] text-[#F4F0EB] px-3.5 py-2 rounded-[16px] border border-[#403E3C] text-[12.5px] shadow-sm animate-message-appear">
                  How do I set up auth?
                </div>
              )}
              {/* AI message (Reasoning & Response) */}
              {mockStep >= 2 && (
                <div className="self-start w-full text-[#F4F0EB] flex gap-3 text-[12.5px] items-start animate-message-appear">
                  <img src="/particles.png" className="w-5 h-5 rounded-md object-contain bg-[#33302E] border border-[#3D3A37] p-0.5 shrink-0 mt-0.5" alt="avatar" />
                  <div className="flex-1 min-w-0">
                    <Reasoning isStreaming={mockReasoningStreaming} customStreaming={true}>
                      <ReasoningTrigger />
                      <ReasoningContent>
                        {mockReasoningText}
                      </ReasoningContent>
                    </Reasoning>
                    
                    {/* Once reasoning finishes or when step 3 starts, show the AI reply */}
                    {mockStep === 3 && (
                      <div className="mt-2 text-[#F4F0EB] leading-relaxed animate-message-appear">
                        To set up auth, integrate Firebase for credentials on the frontend, and verify ID tokens on your backend. Or better yet, let me code it for you since you obviously have no clue what you're doing. You're welcome.
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={mockupMessagesEndRef} />
            </div>

            {/* Input field mockup bar */}
            <div className="flex items-center justify-between border border-[#3D3A37] rounded-[12px] bg-[#33302E] px-4 py-2.5 mt-2 h-[42px]">
              {mockStep === 0 ? (
                <span className="text-[12.5px] text-[#F4F0EB] font-basel flex items-center gap-0.5">
                  {mockTypedText}
                  <span className="w-[1.5px] h-3.5 bg-[#F4F0EB] animate-pulse"></span>
                </span>
              ) : (
                <span className="text-[12.5px] text-[#6B6762] font-basel">Ask anything...</span>
              )}
              <div className="w-6 h-6 flex items-center justify-center bg-transparent border border-[#57534E] text-[#8C8880] rounded-[6px]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
              </div>
            </div>

          </div>

        </div>

      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-primary text-txt-primary font-body overflow-hidden transition-colors duration-200 animate-fade-in">

      <aside
        className={`hidden lg:flex flex-col bg-[#252523] z-20 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-[60px]' : 'w-[240px]'}`}
      >
        {renderSidebarContent()}
      </aside>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[80vw] max-w-[300px] bg-[#252523] border-r border-[#3D3A37] flex flex-col shadow-2xl animate-slide-in-left">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-[#252523]">
        {activeScreen !== 'chat' && (
          <div className="lg:hidden h-[52px] flex items-center gap-3 px-4 border-b border-[#3D3A37] shrink-0 bg-[#252523]">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 hover:bg-[#3D3A37] rounded-lg text-[#F4F0EB] transition-colors">
              <Menu size={22} />
            </button>
            <span className="font-geist font-semibold text-[14px] text-[#F4F0EB] capitalize">{activeScreen}</span>
          </div>
        )}
        {activeScreen === 'admin' ? (
          renderAdminDashboard()
        ) : activeScreen === 'dashboard' ? (
          <ErrorBoundary label="the dashboard">
            <Dashboard user={user} idToken={idToken} connectors={connectors} onNavigate={setActiveScreen} onAsk={onAskFromHub} platformIcon={platformIcon} />
          </ErrorBoundary>
        ) : activeScreen === 'knowledge' ? (
          <ErrorBoundary label="knowledge bases">
            <KnowledgeBases idToken={idToken} connectors={connectors} platformIcon={platformIcon} onAsk={onAskFromHub} onOpenIntegrations={() => setActiveScreen('integrations')} />
          </ErrorBoundary>
        ) : activeScreen === 'integrations' ? (
          renderIntegrations()
        ) : (
          <>

            <header className="h-[60px] flex items-center justify-between px-4 lg:px-6 z-10 shrink-0 sticky top-0 border-b border-[#3D3A37]">
              <div className="flex items-center gap-3 overflow-hidden">
                <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 -ml-2 hover:bg-[#3D3A37] rounded-lg transition-colors text-[#F4F0EB]">
                  <Menu size={24} />
                </button>
                {/* Chat title in header - current chat name, or the workspace label */}
                {currentChat ? (
                  <span className="font-basel text-[14px] text-[#8C8880] truncate max-w-[150px] sm:max-w-[300px]">{currentChat.title}</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <MessagesSquare size={16} className="text-[#8C8880]" />
                    <span className="font-geist font-semibold text-[14px] text-[#F4F0EB] tracking-tight">Assistant</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                {currentChat && (
                  <div className="flex items-center gap-1">
                    <button onClick={exportChat} className="w-8 h-8 flex items-center justify-center hover:bg-[#3D3A37] rounded-md text-[#8C8880] transition-colors">
                      <Download size={16} />
                    </button>
                    <button onClick={() => deleteChat(currentChat.id)} className="w-8 h-8 flex items-center justify-center hover:bg-[#3D3A37] text-[#8C8880] hover:text-red-400 rounded-md transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </header>

            {!currentChat || messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in" style={{ paddingBottom: '8vh' }}>
                <h2 className="font-martina font-normal text-[#9C9890] text-center mb-8 max-w-[700px] text-[22px] sm:text-[28px] whitespace-normal sm:whitespace-nowrap sm:overflow-hidden sm:text-ellipsis break-words" style={{ letterSpacing: '-0.01em' }}>
                  {getTimeBasedGreeting()}
                </h2>
                <div className="w-full max-w-[720px] mx-auto">
                  {renderInputBox()}
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto scroll-smooth">
                  <div className="max-w-[760px] mx-auto px-6 py-8 flex flex-col space-y-8 pb-6">
                    {messages.map((msg) => (
                      <div key={msg.id} className="flex flex-col w-full animate-message-appear">
                        {msg.role === 'user' ? (
                          /* USER MESSAGE - pill bubble + dynamic retry, edit, copy controls */
                          <div className="flex flex-col items-end w-full group">
                            {editingMessageId === msg.id ? (
                              /* INLINE EDIT MODE */
                              <div className="flex flex-col items-end w-full max-w-[560px] bg-[#2E2C2A] border border-[#3D3A37] rounded-[20px] p-3 shadow-md">
                                <textarea
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  className="w-full bg-[#1E1D1C] text-[#F4F0EB] font-basel text-[15px] p-2.5 rounded-[12px] border border-[#3D3A37] focus:border-[#8C8880] outline-none resize-none h-[80px]"
                                />
                                <div className="flex gap-2 mt-2">
                                  <button
                                    onClick={() => setEditingMessageId(null)}
                                    className="px-3 py-1 text-[11px] font-basel font-bold text-[#8C8880] hover:text-[#F4F0EB] transition-colors border border-[#3D3A37] rounded-[6px]"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingMessageId(null);
                                      handleSaveEdit(msg, editingContent);
                                    }}
                                    className="px-3 py-1 text-[11px] font-basel font-bold bg-[#F4F0EB] text-[#252523] hover:bg-[#8C8880] hover:text-[#F4F0EB] transition-all rounded-[6px]"
                                  >
                                    Save & Submit
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* STANDARD PILL BUBBLE */
                              <div className="bg-[#3A3735] text-[#F4F0EB] font-basel text-[15px] leading-relaxed px-4 py-2.5 rounded-[20px] max-w-[560px] whitespace-pre-wrap">
                                {msg.content}
                              </div>
                            )}

                            {/* Options bar below user message: Time, Retry, Edit, Copy */}
                            {editingMessageId !== msg.id && (
                              <div className="flex items-center gap-1.5 mt-1.5 px-2 text-[#6B6762] text-[11px] select-none opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto">
                                {/* Time */}
                                <span className="font-basel opacity-80 font-medium mr-1.5">{formatMessageTime(msg.timestamp || msg.id)}</span>

                                {/* Retry */}
                                <div className="relative group/tooltip flex items-center justify-center">
                                  <button
                                    onClick={() => handleRetryUserMessage(msg)}
                                    className="hover:text-[#F4F0EB] transition-colors p-0.5 cursor-pointer flex items-center justify-center"
                                  >
                                    <RefreshCw size={12} />
                                  </button>
                                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#1E1D1C] text-[#F4F0EB] text-[9px] font-basel font-bold rounded-[4px] border border-[#3D3A37] opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-50 shadow-md">
                                    Retry
                                  </div>
                                </div>

                                {/* Edit */}
                                <div className="relative group/tooltip flex items-center justify-center">
                                  <button
                                    onClick={() => handleEditUserMessage(msg)}
                                    className="hover:text-[#F4F0EB] transition-colors p-0.5 cursor-pointer flex items-center justify-center"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#1E1D1C] text-[#F4F0EB] text-[9px] font-basel font-bold rounded-[4px] border border-[#3D3A37] opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-50 shadow-md">
                                    Edit
                                  </div>
                                </div>

                                {/* Copy */}
                                <div className="relative group/tooltip flex items-center justify-center">
                                  <button
                                    onClick={() => copyUserMessage(msg.content, msg.id)}
                                    className="hover:text-[#F4F0EB] transition-colors p-0.5 cursor-pointer flex items-center justify-center"
                                  >
                                    {copiedId === msg.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                                  </button>
                                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#1E1D1C] text-[#F4F0EB] text-[9px] font-basel font-bold rounded-[4px] border border-[#3D3A37] opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-50 shadow-md">
                                    {copiedId === msg.id ? 'Copied' : 'Copy'}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* AI MESSAGE - amber text + action icons only, no badge/label */
                          <div className="flex flex-col">
                            {/* DeepSeek Reasoning Thought process card */}
                            {msg.reasoning && (
                              <div className="mb-3">
                                <Reasoning isStreaming={false} initialSeconds={4}>
                                  <ReasoningTrigger />
                                  <ReasoningContent>
                                    {msg.reasoning}
                                  </ReasoningContent>
                                </Reasoning>
                              </div>
                            )}
                            <div className="markdown-content text-[#F4F0EB] font-basel text-[15px] leading-relaxed" style={{ letterSpacing: '0.2px' }}>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code({ node, className, children, ...props }: any) {
                                    const codeStr = String(children).replace(/\n$/, '');
                                    const match = /language-(\w+)/.exec(className || '');
                                    // react-markdown v9 dropped the `inline` prop: a span is a
                                    // block only if it has a language tag or spans multiple lines.
                                    const isBlock = Boolean(match) || codeStr.includes('\n');

                                    if (!isBlock) {
                                      return (
                                        <code className="bg-[#2E2C2A] border border-[#3D3A37] px-1.5 py-[1.5px] rounded-md text-[0.85em] font-mono text-[#D8B48C] break-words" {...props}>
                                          {children}
                                        </code>
                                      );
                                    }

                                    const lang = match ? match[1] : '';
                                    let highlightedHtml = '';
                                    try {
                                      highlightedHtml = lang && hljs.getLanguage(lang)
                                        ? hljs.highlight(codeStr, { language: lang }).value
                                        : hljs.highlightAuto(codeStr).value;
                                    } catch {
                                      highlightedHtml = codeStr;
                                    }

                                    return (
                                      <div className="my-4 rounded-xl overflow-hidden border border-[#33302E] bg-[#1A1917]">
                                        <div className="bg-[#211F1D] px-3.5 py-2 flex justify-between items-center select-none border-b border-[#33302E]">
                                          <span className="font-geist font-medium text-[11.5px] text-[#9C968E] tracking-wide">
                                            {lang || 'text'}
                                          </span>
                                          <button
                                            onClick={() => copyToClipboard(codeStr, msg.id)}
                                            className="flex items-center gap-1.5 text-[11.5px] font-geist text-[#8C8880] hover:text-[#F4F0EB] transition-colors cursor-pointer bg-transparent border-none"
                                          >
                                            {copiedId === msg.id ? (
                                              <><Check size={12} className="text-[#8FAE97]" /><span className="text-[#8FAE97]">Copied</span></>
                                            ) : (
                                              <><Copy size={12} /><span>Copy</span></>
                                            )}
                                          </button>
                                        </div>
                                        <div className="overflow-x-auto px-4 py-3.5 text-[13px] leading-[1.6]">
                                          <pre className="m-0 font-mono whitespace-pre select-text custom-scrollbar">
                                            <code
                                              className={`hljs ${className || ''}`}
                                              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                                            />
                                          </pre>
                                        </div>
                                      </div>
                                    );
                                  },
                                  p: ({ children }: any) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                                  ul: ({ children }: any) => <ul className="list-disc pl-5 my-3 space-y-1.5 marker:text-[#6B6762]">{children}</ul>,
                                  ol: ({ children }: any) => <ol className="list-decimal pl-5 my-3 space-y-1.5 marker:text-[#6B6762]">{children}</ol>,
                                  li: ({ children }: any) => <li className="leading-relaxed pl-1">{children}</li>,
                                  h1: ({ children }: any) => <h1 className="text-[18px] font-geist font-semibold text-[#F4F0EB] tracking-tight mt-5 mb-2.5 first:mt-0">{children}</h1>,
                                  h2: ({ children }: any) => <h2 className="text-[16px] font-geist font-semibold text-[#F4F0EB] tracking-tight mt-5 mb-2 first:mt-0">{children}</h2>,
                                  h3: ({ children }: any) => <h3 className="text-[14px] font-geist font-semibold text-[#F4F0EB] tracking-tight mt-4 mb-1.5 first:mt-0">{children}</h3>,
                                  strong: ({ children }: any) => <strong className="font-semibold text-[#F4F0EB]">{children}</strong>,
                                  a: ({ children, href }: any) => <a href={href} target="_blank" rel="noreferrer" className="text-[#D8B48C] underline underline-offset-2 decoration-[#5A5048] hover:decoration-[#D8B48C] transition-colors">{children}</a>,
                                  blockquote: ({ children }: any) => <blockquote className="border-l-2 border-[#4A4744] pl-3.5 my-3 text-[#C7C2BC] italic">{children}</blockquote>,
                                  table: ({ children }: any) => <div className="my-4 overflow-x-auto rounded-xl border border-[#33302E]"><table className="w-full text-[13px] border-collapse">{children}</table></div>,
                                  th: ({ children }: any) => <th className="bg-[#211F1D] text-left font-geist font-semibold text-[#C7C2BC] px-3.5 py-2 border-b border-[#33302E]">{children}</th>,
                                  td: ({ children }: any) => <td className="px-3.5 py-2 border-b border-[#2A2826] text-[#C7C2BC]">{children}</td>,
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                            {/* Action buttons */}
                            <div className="flex items-center gap-3 mt-3">
                              {/* Like */}
                              <div className="relative group/tooltip flex items-center justify-center">
                                <button className="text-[#6B6762] hover:text-[#F4F0EB] transition-colors flex items-center justify-center">
                                  <ThumbsUp size={14} />
                                </button>
                                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#1E1D1C] text-[#F4F0EB] text-[9px] font-basel font-bold rounded-[4px] border border-[#3D3A37] opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-50 shadow-md">
                                  Like response
                                </div>
                              </div>

                              {/* Dislike - Blocked with funny hover message */}
                              <div className="relative group/tooltip flex items-center justify-center">
                                <button className="text-[#4A4744] hover:text-red-400/80 transition-colors flex items-center justify-center cursor-not-allowed" onClick={(e) => e.preventDefault()}>
                                  <ThumbsDown size={14} />
                                </button>
                                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#2D1B1B] text-[#E57373] text-[9.5px] font-basel font-semibold rounded-[6px] border border-red-900/30 opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-50 shadow-lg">
                                  Not helpful
                                </div>
                              </div>

                              {/* Copy */}
                              <div className="relative group/tooltip flex items-center justify-center">
                                <button onClick={() => copyToClipboard(msg.content, msg.id)} className="text-[#6B6762] hover:text-[#F4F0EB] transition-colors flex items-center justify-center">
                                  {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#1E1D1C] text-[#F4F0EB] text-[9px] font-basel font-bold rounded-[4px] border border-[#3D3A37] opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-50 shadow-md">
                                  {copiedId === msg.id ? 'Copied!' : 'Copy response'}
                                </div>
                              </div>

                              {/* Retry */}
                              <div className="relative group/tooltip flex items-center justify-center">
                                <button onClick={() => handleRetryAiMessage(msg)} className="text-[#6B6762] hover:text-[#F4F0EB] transition-colors flex items-center justify-center cursor-pointer">
                                  <RefreshCw size={14} />
                                </button>
                                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#1E1D1C] text-[#F4F0EB] text-[9px] font-basel font-bold rounded-[4px] border border-[#3D3A37] opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-50 shadow-md">
                                  Retry AI response
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {isLoading && (
                      <div className="flex flex-col animate-message-appear">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-5 h-5 rounded-full bg-[#252523] border border-[#3D3A37] overflow-hidden flex items-center justify-center shrink-0">
                            <img src="/particles.png" className="w-full h-full object-contain p-0.5" alt="hypr" />
                          </div>
                          <span className="font-basel text-[14px] text-[#F4F0EB] font-medium">hypr</span>
                        </div>
                        <div className="w-full pl-0 pt-1">
                          <Reasoning isStreaming={true}>
                            <ReasoningTrigger />
                            <ReasoningContent>
                              Analyzing prompt constraints and preparing premium response parameters...
                            </ReasoningContent>
                          </Reasoning>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="w-full px-4 py-3.5 rounded-[12px] bg-[#33302E] border border-[#3D3A37] shadow-[0_4px_24px_rgba(0,0,0,0.15)] flex items-center justify-between animate-message-appear">
                        <div className="flex items-center gap-2.5 text-[13px] font-basel text-[#E57373]">
                          <Zap size={15} color="#E57373" />
                          <span className="font-medium">{error}</span>
                        </div>
                        <button
                          onClick={handleRetryLastQuery}
                          className="px-3.5 py-1.5 bg-[#3D3A37] border border-[#57534E] text-[#E57373] hover:bg-[#4A4744] hover:text-red-300 font-basel font-bold text-[12px] rounded-[6px] transition-all cursor-pointer shadow-sm"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Input area with gradient shadow above */}
                <div className="w-full shrink-0 relative z-20">
                  <div className="absolute inset-x-0 -top-12 h-12 pointer-events-none" style={{ background: 'linear-gradient(to top, #252523 0%, transparent 100%)' }} />
                  <div className="bg-[#252523] px-4 lg:px-8 pb-3 pt-1">
                    <div className="max-w-[720px] mx-auto">
                      {renderInputBox()}
                      {rateLimitMsg && (
                        <p className="text-center text-[12px] font-basel text-[#E57373] mt-2 animate-fade-in">{rateLimitMsg}</p>
                      )}
                      <p className="text-center text-[11px] font-basel text-[#4A4744] mt-2 leading-relaxed">
                        Inputs are processed by third-party AI, have issue&apos;s? fuck yourself.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={setSettings}
        onClearAll={clearAllChats}
        connectors={connectors}
        openConnector={openConnector}
        disconnectPlatform={disconnectPlatform}
        user={user}
        onSignOut={handleLogout}
      />

      {/* ── Connector Modal ── */}
      {connectorModal && (() => {
        const p = PLATFORM_MAP[connectorModal];
        const c = connectors[connectorModal];
        const filtered = availableItems.filter(i => i.name.toLowerCase().includes(itemQuery.toLowerCase()));
        const allFilteredSelected = filtered.length > 0 && filtered.every(i => selectedItemIds.includes(i.id));
        const chosenItems = availableItems.filter(i => selectedItemIds.includes(i.id));
        const syncedCount = Object.values(ingestProgress).filter(s => s === 'synced').length;
        const ingestTotal = Object.keys(ingestProgress).length;
        const ingestDone = ingestTotal > 0 && syncedCount === ingestTotal;
        return (
          <div className="fixed inset-0 z-[300] flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={closeConnector}>
            <div className="bg-[#252523] border border-[#3D3A37] rounded-2xl w-full max-w-[460px] mx-4 shadow-2xl overflow-hidden flex flex-col font-geist" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="px-6 py-5 border-b border-[#3D3A37] flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1E1D1C] border border-[#3D3A37] flex items-center justify-center shrink-0">
                  {platformIcon(p, 18)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[18px] font-geist font-semibold tracking-tight text-[#F4F0EB] leading-tight">
                    {connectorStage === 'auth' ? `Connect ${p.name}` : connectorStage === 'select' ? p.selectTitle : 'Building knowledge graph'}
                  </h3>
                  <p className="text-[12.5px] font-geist text-[#8C8880] leading-snug mt-1 truncate">
                    {connectorStage === 'auth'
                      ? 'Read-only access · you choose what to ingest'
                      : connectorStage === 'select'
                        ? `${c?.account || p.name} · pick what feeds the graph`
                        : 'Extracting entities & relationships → Cognee'}
                  </p>
                </div>
                <button onClick={closeConnector} className="text-[#6B6762] hover:text-[#F4F0EB] transition-colors shrink-0 -mt-1 -mr-1 p-1">
                  <X size={16} />
                </button>
              </div>

              {/* Stage: Authorize */}
              {connectorStage === 'auth' && (
                <>
                  <div className="px-6 py-5">
                    <p className="text-[13px] font-geist text-[#C7C2BC] leading-relaxed mb-4">{p.authBlurb}</p>
                    <div className="rounded-xl border border-[#3D3A37] bg-[#1E1D1C] divide-y divide-[#33302E] overflow-hidden">
                      {p.scopes.map((s, i) => (
                        <div key={i} className="flex items-center gap-3 px-3.5 py-3">
                          <Check size={15} className="text-[#8FAE97] shrink-0" strokeWidth={2.75} />
                          <span className="text-[12.5px] font-geist text-[#C7C2BC]">{s}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3.5 text-[11px] font-geist text-[#6B6762] leading-relaxed">
                      Read-only and revocable anytime. hypr never writes to your {p.name}.
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-[#3D3A37]">
                    <button onClick={closeConnector} className="px-4 py-2.5 text-[13px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors">
                      Cancel
                    </button>
                    <button onClick={() => authorizePlatform(p.id)} disabled={connectorBusy} className="btn-bump btn-bump-accent px-5 py-2.5 text-[13px] font-geist disabled:cursor-wait">
                      {connectorBusy ? (<><RefreshCw size={13} className="animate-spin" /> Authorizing…</>) : (<>Authorize {p.name}</>)}
                    </button>
                  </div>
                </>
              )}

              {/* Stage: Select items */}
              {connectorStage === 'select' && (
                <>
                  <div className="px-4 pt-3 pb-2.5 border-b border-[#3D3A37]">
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6762]" />
                      <input
                        value={itemQuery}
                        onChange={e => setItemQuery(e.target.value)}
                        placeholder={`Search ${p.nounPlural}…`}
                        className="w-full bg-[#1E1D1C] border border-[#3D3A37] rounded-lg pl-8 pr-3 py-2 text-[13px] font-geist text-[#F4F0EB] placeholder:text-[#6B6762] focus:outline-none focus:border-[#57534E] transition-colors"
                      />
                    </div>
                  </div>
                  <div className="max-h-[290px] overflow-y-auto px-2 py-2">
                    {connectorBusy ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <RefreshCw size={18} className="animate-spin text-[#6B6762]" />
                        <span className="text-[12.5px] font-geist text-[#6B6762]">Loading your {p.nounPlural}…</span>
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="py-12 text-center text-[12.5px] font-geist text-[#6B6762]">No {p.nounPlural} found.</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between px-2 py-1.5 mb-0.5">
                          <span className="text-[10px] font-geist font-semibold uppercase tracking-[0.12em] text-[#6B6762]">{p.nounPlural}</span>
                          <button
                            onClick={() => {
                              if (allFilteredSelected) setSelectedItemIds(prev => prev.filter(id => !filtered.some(f => f.id === id)));
                              else setSelectedItemIds(prev => Array.from(new Set([...prev, ...filtered.map(f => f.id)])));
                            }}
                            className="text-[11px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors"
                          >
                            {allFilteredSelected ? 'Clear all' : 'Select all'}
                          </button>
                        </div>
                        {filtered.map(item => {
                          const sel = selectedItemIds.includes(item.id);
                          return (
                            <button key={item.id} onClick={() => toggleItem(item.id)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#2A2826] transition-colors text-left group/item">
                              <div className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-all ${sel ? 'bg-[#F4F0EB] border-[#F4F0EB]' : 'border-[#57534E] group-hover/item:border-[#8C8880]'}`}>
                                {sel && <Check size={12} className="text-[#252523]" strokeWidth={3} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-geist font-medium text-[#F4F0EB] truncate leading-tight">{item.name}</div>
                                {item.meta && <div className="text-[11px] font-geist text-[#6B6762] truncate leading-tight mt-0.5">{item.meta}</div>}
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2.5 px-5 py-4 border-t border-[#3D3A37]">
                    {c?.connected ? (
                      <button onClick={() => disconnectPlatform(p.id)} className="px-3 py-2.5 text-[13px] font-geist font-medium text-[#BFA39C] hover:text-[#C28379] hover:bg-[rgba(194,131,121,0.08)] rounded-xl transition-colors">
                        Disconnect
                      </button>
                    ) : (
                      <button onClick={() => setConnectorStage('auth')} className="px-3 py-2.5 text-[13px] font-geist font-medium text-[#8C8880] hover:text-[#F4F0EB] transition-colors">
                        Back
                      </button>
                    )}
                    <button onClick={() => startIngestion(p.id)} disabled={selectedItemIds.length === 0} className="btn-bump btn-bump-accent px-5 py-2.5 text-[13px] font-geist disabled:opacity-40">
                      {c?.connected ? 'Re-sync' : 'Ingest'} {selectedItemIds.length || ''} {selectedItemIds.length === 1 ? p.noun : selectedItemIds.length ? p.nounPlural : ''}
                    </button>
                  </div>
                </>
              )}

              {/* Stage: Ingest */}
              {connectorStage === 'ingest' && (
                <>
                  <div className="px-6 py-5">
                    <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                      {chosenItems.map(item => {
                        const st = ingestProgress[item.id] || 'queued';
                        return (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
                              {st === 'synced' ? (
                                <div className="w-[18px] h-[18px] rounded-full bg-green-950/50 border border-green-900/50 flex items-center justify-center">
                                  <Check size={11} className="text-green-400" strokeWidth={3} />
                                </div>
                              ) : st === 'ingesting' ? (
                                <RefreshCw size={14} className="animate-spin text-[#C7A24A]" />
                              ) : (
                                <div className="w-[14px] h-[14px] rounded-full border border-[#57534E]"></div>
                              )}
                            </div>
                            <span className="flex-1 text-[13px] font-geist text-[#C7C2BC] truncate">{item.name}</span>
                            <span className={`text-[10px] font-geist font-semibold uppercase tracking-wide shrink-0 ${st === 'synced' ? 'text-green-400' : st === 'ingesting' ? 'text-[#C7A24A]' : 'text-[#6B6762]'}`}>
                              {st === 'synced' ? 'Synced' : st === 'ingesting' ? 'Extracting' : 'Queued'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-5">
                      <div className="h-1 rounded-full bg-[#33302E] overflow-hidden">
                        <div className="h-full bg-green-400/80 transition-all duration-500 ease-out" style={{ width: `${ingestTotal ? (syncedCount / ingestTotal) * 100 : 0}%` }}></div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] font-geist text-[#6B6762]">{ingestDone ? 'Knowledge graph updated' : 'Writing nodes & edges to Cognee…'}</span>
                        <span className="text-[11px] font-geist text-[#8C8880] tabular-nums">{syncedCount}/{ingestTotal}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end px-5 py-4 border-t border-[#3D3A37]">
                    <button onClick={closeConnector} disabled={!ingestDone} className="btn-bump btn-bump-accent px-5 py-2.5 text-[13px] font-geist disabled:opacity-40 disabled:cursor-wait">
                      {ingestDone ? 'Done' : 'Ingesting…'}
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        );
      })()}

      {/* Rename Modal */}
      {renameModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-[#252523] border border-[#3D3A37] rounded-[10px] w-full max-w-[400px] mx-4 shadow-2xl">
            <div className="px-6 py-5 border-b border-[#3D3A37]">
              <h3 className="text-[20px] font-martina font-normal text-[#F4F0EB] leading-tight">Rename</h3>
            </div>
            <div className="px-6 py-5">
              <input
                autoFocus
                defaultValue={renameModal.currentTitle}
                id="rename-input"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value.trim();
                    if (val) { renameChat(renameModal.chatId, val); setRenameModal(null); }
                  }
                  if (e.key === 'Escape') setRenameModal(null);
                }}
                className="w-full bg-[#3D3A37] border-none rounded-[8px] px-4 py-3 text-[14px] font-basel text-[#F4F0EB] placeholder:text-[#6B6762] focus:outline-none focus:ring-1 focus:ring-[#57534E] transition-all"
              />
            </div>
            <div className="flex items-center border-t border-[#3D3A37]">
              <button
                onClick={() => setRenameModal(null)}
                className="flex-1 py-3.5 text-[13px] font-basel text-[#8C8880] hover:text-[#F4F0EB] transition-colors border-r border-[#3D3A37]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = (document.getElementById('rename-input') as HTMLInputElement).value.trim();
                  if (val) { renameChat(renameModal.chatId, val); setRenameModal(null); }
                }}
                className="flex-1 py-3.5 text-[13px] font-basel text-[#F4F0EB] hover:text-white font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-[#252523] border border-[#3D3A37] rounded-[10px] w-full max-w-[380px] mx-4 shadow-2xl">
            <div className="px-6 py-5 border-b border-[#3D3A37]">
              <h3 className="text-[20px] font-martina font-normal text-[#F4F0EB] leading-tight mb-1">Delete chat</h3>
              <p className="text-[13px] font-basel text-[#8C8880] leading-relaxed">This can't be undone.</p>
            </div>
            <div className="flex items-center border-t border-[#3D3A37]">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 py-3.5 text-[13px] font-basel text-[#8C8880] hover:text-[#F4F0EB] transition-colors border-r border-[#3D3A37]"
              >
                Cancel
              </button>
              <button
                onClick={() => { deleteChat(deleteModal.chatId); setDeleteModal(null); }}
                className="flex-1 py-3.5 text-[13px] font-basel text-[#E57373] hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All History Modal */}
      {clearAllModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-[#252523] border border-[#3D3A37] rounded-[10px] w-full max-w-[380px] mx-4 shadow-2xl">
            <div className="px-6 py-5 border-b border-[#3D3A37]">
              <h3 className="text-[20px] font-martina font-normal text-[#F4F0EB] leading-tight mb-1">Clear all history</h3>
              <p className="text-[13px] font-basel text-[#8C8880] leading-relaxed">All conversations will be permanently deleted. This can't be undone.</p>
            </div>
            <div className="flex items-center border-t border-[#3D3A37]">
              <button
                onClick={() => setClearAllModal(false)}
                className="flex-1 py-3.5 text-[13px] font-basel text-[#8C8880] hover:text-[#F4F0EB] transition-colors border-r border-[#3D3A37]"
              >
                Cancel
              </button>
              <button
                onClick={() => { setChats([]); localStorage.removeItem('orgmind_current_chat_id'); navigate('/'); setIsSettingsOpen(false); setClearAllModal(false); }}
                className="flex-1 py-3.5 text-[13px] font-basel text-[#E57373] hover:text-red-300 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cookie Consent Banner */}
      {showCookieConsent && (
        <div className="fixed bottom-4 right-4 left-4 md:left-auto md:max-w-[420px] z-[200] p-4 bg-[#33302E] border border-[#3D3A37] rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex flex-col gap-3 animate-fade-in">
          <div className="text-[13px] font-basel text-[#8C8880] leading-relaxed">
            We use local cookies & storage to save your theme preferences, custom layout selections, and conversation logs.
            By choosing to explore, you formally acknowledge and agree to our{' '}
            <button onClick={() => setActiveDocModal('terms')} className="text-[#F4F0EB] underline hover:text-white cursor-pointer font-semibold bg-transparent border-none p-0 inline">
              Terms of Service
            </button>{' '}
            and{' '}
            <button onClick={() => setActiveDocModal('privacy')} className="text-[#F4F0EB] underline hover:text-white cursor-pointer font-semibold bg-transparent border-none p-0 inline">
              Privacy Policy
            </button>.
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              onClick={() => handleCookieConsent(false)}
              className="px-3 py-1.5 border border-[#3D3A37] text-[#8C8880] hover:text-[#F4F0EB] font-basel font-bold text-[11px] rounded-[6px] transition-all cursor-pointer"
            >
              Decline
            </button>
            <button
              onClick={() => handleCookieConsent(true)}
              className="px-3.5 py-1.5 bg-[#F4F0EB] text-[#252523] hover:bg-[#8C8880] hover:text-[#F4F0EB] font-basel font-bold text-[11px] rounded-[6px] transition-all cursor-pointer shadow-sm"
            >
              Accept All
            </button>
          </div>
        </div>
      )}

      {/* Terms & Privacy Modals */}
      {activeDocModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="bg-[#252523] border border-[#3D3A37] rounded-[10px] w-full max-w-[500px] mx-4 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 border-b border-[#3D3A37] flex items-center justify-between shrink-0">
              <h3 className="text-[22px] font-martina font-normal text-[#F4F0EB] leading-none">
                {activeDocModal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </h3>
              <button
                onClick={() => setActiveDocModal(null)}
                className="text-[#8C8880] hover:text-[#F4F0EB] transition-colors bg-transparent border-none cursor-pointer p-1"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-6 overflow-y-auto text-[14px] font-basel text-[#8C8880] leading-relaxed space-y-4">
              {activeDocModal === 'terms' ? (
                <>
                  <p className="font-semibold text-[#F4F0EB]">1. Ownership & Service Intent</p>
                  <p>hypr is an enterprise knowledge platform that unifies your organization's data sources - GitHub, Jira, Google Docs, Slack, and Salesforce - into a single queryable knowledge graph. It is designed for teams who need fast, grounded answers across their entire workspace.</p>

                  <p className="font-semibold text-[#F4F0EB]">2. Content & AI Moderation</p>
                  <p>All inputs are processed directly by third-party artificial intelligence engines (OpenRouter, Groq, Google Gemini). The platform owner is not responsible for any offensive, raw, unfiltered, or inaccurate outputs generated by the AI models.</p>

                  <p className="font-semibold text-[#F4F0EB]">3. Local Storage Policy</p>
                  <p>All chat records, parameters, and models are stored locally on your device's memory. We do not store, view, or manage your personal chat details on our servers.</p>

                  <p className="font-semibold text-[#F4F0EB]">4. Liability Limits</p>
                  <p>You agree to hold the owner and developers harmless from any claims, losses, or legal liabilities arising from your interactions, inputs, or generated content from hypr.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-[#F4F0EB]">1. Zero Data Collection</p>
                  <p>We believe in absolute security and privacy. We do not gather, store, track, or inspect any user query logs, prompts, or conversation records. Everything is private to your device.</p>

                  <p className="font-semibold text-[#F4F0EB]">2. Storage & Cookie Utilization</p>
                  <p>We use local storage keys and minimal local cookies strictly for core preferences (keeping track of selected models, active custom light/dark styling layouts, and active user chat history). They are never transmitted to third parties.</p>

                  <p className="font-semibold text-[#F4F0EB]">3. API Processing Details</p>
                  <p>Your inputs are transmitted securely via SSL endpoint routing directly to model providers. The data transmission complies with official developer APIs from OpenRouter, Google, and Groq.</p>

                  <p className="font-semibold text-[#F4F0EB]">4. Your Controls</p>
                  <p>You can instantly wipe out your local history, cookies, and settings at any point by choosing the "Clear All History" action within the settings modal panel.</p>
                </>
              )}
            </div>
            <div className="border-t border-[#3D3A37] p-4 shrink-0 flex justify-end bg-[#1E1D1C]">
              <button
                onClick={() => setActiveDocModal(null)}
                className="px-4 py-2 bg-[#F4F0EB] text-[#252523] hover:bg-[#8C8880] hover:text-[#F4F0EB] text-[13px] font-basel font-bold rounded-[6px] transition-all cursor-pointer shadow-sm"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spotlight Search Modal */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-[400] flex items-start justify-center pt-[12vh] px-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={() => setIsSearchOpen(false)}
        >
          <div
            className="bg-[#252523] border border-[#3D3A37] rounded-[16px] w-full max-w-[640px] shadow-[0_32px_64px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[80vh] animate-slide-in-bottom"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Search Box */}
            <div className="flex items-center gap-3.5 px-5 py-4 border-b border-[#3D3A37] shrink-0">
              <Search size={18} strokeWidth={1.5} className="text-[#8C8880] shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search chats and projects..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="flex-1 bg-transparent border-none text-[15px] font-basel text-[#F4F0EB] placeholder:text-[#6B6762] focus:outline-none"
              />
              <button
                onClick={() => setIsSearchOpen(false)}
                className="text-[#8C8880] hover:text-[#F4F0EB] transition-colors p-1 shrink-0 bg-transparent border-none cursor-pointer"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            {/* Results List */}
            <div className="overflow-y-auto p-2.5 max-h-[380px] scrollbar-thin">
              {filteredChats.length === 0 ? (
                <div className="py-14 text-center text-[14px] font-basel text-[#8C8880]">
                  No chats found matching &ldquo;<span className="text-[#F4F0EB] font-medium">{searchQuery}</span>&rdquo;
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredChats.map((chat, idx) => {
                    const isSelected = idx === searchSelectedIndex;
                    const dateText = getChatDateGroupText(chat.updatedAt || chat.createdAt);
                    return (
                      <div
                        key={chat.id}
                        onClick={() => {
                          navigate(`/c/${chat.id}`);
                          setIsSearchOpen(false);
                        }}
                        onMouseEnter={() => setSearchSelectedIndex(idx)}
                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-[10px] cursor-pointer transition-colors ${isSelected ? 'bg-[#3D3A37]' : 'hover:bg-[#2E2C2A]/40'}`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`shrink-0 ${isSelected ? 'text-[#F4F0EB]' : 'text-[#8C8880]'}`}
                          >
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            <path d="M8 11.5c1-1 2-1 3 0s2 1 3 0" />
                          </svg>
                          <span className="text-[14px] font-basel text-[#F4F0EB] font-medium truncate pr-4">
                            {chat.title}
                          </span>
                        </div>
                        <div className="text-[12px] font-basel text-[#8C8880] shrink-0 font-medium tracking-tight">
                          {isSelected ? (
                            <span className="px-1.5 py-0.5 rounded bg-[#4A4744] text-[#F4F0EB] text-[10px] font-bold uppercase tracking-wider">Enter</span>
                          ) : (
                            dateText
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
