'use client';

import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  GitMerge,
  MessageSquareText,
  Network,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import Reveal from './Reveal';

function Chip({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' | 'gold' }) {
  const styles = {
    light: 'border border-cream-300 bg-white text-ink-600',
    dark: 'bg-ink text-cream-50',
    gold: 'bg-gold-soft text-gold-deep',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-[11.5px] font-medium ${styles}`}>
      {children}
    </span>
  );
}

function Arrow() {
  return <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />;
}

/* ── Per-capability visuals ── */

function OntologyVisual() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="dark">Repository</Chip>
        <Chip>HAS_PR</Chip>
        <Arrow />
        <Chip tone="dark">PullRequest</Chip>
        <Chip>RESOLVES</Chip>
        <Arrow />
        <Chip tone="dark">Issue</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="dark">Issue</Chip>
        <Chip>DISCUSSION_IN</Chip>
        <Arrow />
        <Chip tone="dark">Channel</Chip>
        <Arrow />
        <Chip tone="dark">Message</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="dark">Account</Chip>
        <Chip>AGREEMENT_DOC</Chip>
        <Arrow />
        <Chip tone="dark">Document</Chip>
        <Chip>MENTIONS</Chip>
        <Arrow />
        <Chip tone="dark">Issue</Chip>
      </div>
      <p className="text-[12.5px] text-ink-400">
        Every platform normalizes into this schema before a single write hits Cognee.
      </p>
    </div>
  );
}

function DeterministicVisual() {
  return (
    <div className="space-y-3">
      {['GitHub: "merged PR #418"', 'Slack: "the 418 fix is live"', 'Jira: "PAY-212, see PR 418"'].map(
        (mention) => (
          <div key={mention} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate rounded-md border border-cream-300 bg-white px-3 py-2 text-[12.5px] text-ink-500">
              {mention}
            </span>
            <Arrow />
          </div>
        ),
      )}
      <div className="flex items-center gap-3 pt-1">
        <span className="flex-1 border-t border-dashed border-cream-300" />
        <Chip tone="dark">PullRequest #418 · one node</Chip>
        <span className="flex-1 border-t border-dashed border-cream-300" />
      </div>
      <p className="text-[12.5px] text-ink-400">
        Entity resolution runs before the write, so three mentions land as one node.
      </p>
    </div>
  );
}

function RrfVisual() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-cream-300 bg-white p-3">
          <p className="text-[11px] font-semibold text-ink-400">Graph lookup</p>
          <div className="mt-2 space-y-1.5 text-[12px] text-ink-600">
            <p>1. PR #418</p>
            <p>2. PAY-212</p>
            <p>3. #incidents thread</p>
          </div>
        </div>
        <div className="rounded-lg border border-cream-300 bg-white p-3">
          <p className="text-[11px] font-semibold text-ink-400">Vector search</p>
          <div className="mt-2 space-y-1.5 text-[12px] text-ink-600">
            <p>1. #incidents thread</p>
            <p>2. runbook.md</p>
            <p>3. PR #418</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="dash-line h-px w-10" />
        <Chip tone="gold">Reciprocal rank fusion</Chip>
        <span className="dash-line h-px w-10" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Chip tone="dark">1. PR #418</Chip>
        <Chip tone="dark">2. #incidents</Chip>
        <Chip tone="dark">3. PAY-212</Chip>
      </div>
    </div>
  );
}

function DeltaVisual() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className={`h-8 flex-1 rounded-sm ${
              i === 5 || i === 11 ? 'bg-gold' : i % 4 === 0 ? 'bg-cream-300' : 'bg-cream-200'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[12px] text-ink-400">
        <span>Poll · diff · upsert, every 30 minutes</span>
        <span className="font-semibold text-ink-600">2 deltas found</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip>
          <s>status: OPEN</s>
        </Chip>
        <Arrow />
        <Chip tone="dark">status: MERGED</Chip>
        <span className="text-[12px] text-ink-400">history preserved, nothing rebuilt</span>
      </div>
    </div>
  );
}

function CorrectionVisual() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip>
          <s>&ldquo;payment flow&rdquo;</s>
        </Chip>
        <Chip>
          <s>&ldquo;StripeGateway&rdquo;</s>
        </Chip>
        <Arrow />
        <Chip tone="dark">PaymentGateway</Chip>
        <Chip tone="gold">2 source attributions kept</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip>
          <s>edge → deleted Slack msg</s>
        </Chip>
        <Arrow />
        <Chip tone="gold">pruned, path archived</Chip>
      </div>
      <p className="text-[12.5px] text-ink-400">
        An async LangGraph pass scans sub-graphs, merges duplicates inside Cognee and clears
        orphans. The graph never rots.
      </p>
    </div>
  );
}

function MemoryVisual() {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5 rounded-lg border border-cream-300 bg-white p-3.5 font-mono text-[12px] text-ink-600">
        <p>
          (you) <span className="text-gold-deep">-[:PREFERS]-&gt;</span> (Python)
        </p>
        <p>
          (you) <span className="text-gold-deep">-[:WORKS_ON]-&gt;</span> (frontend-app)
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip>&ldquo;open bugs in my project?&rdquo;</Chip>
        <Arrow />
        <Chip tone="gold">resolves via WORKS_ON</Chip>
        <Arrow />
        <Chip tone="dark">frontend-app bugs</Chip>
      </div>
      <p className="text-[12.5px] text-ink-400">
        Chat context becomes typed edges in Cognee, not throwaway history.
      </p>
    </div>
  );
}

const CAPABILITIES = [
  {
    Icon: Network,
    title: 'Typed enterprise ontology',
    tagline: 'A strict schema for every platform',
    visual: <OntologyVisual />,
  },
  {
    Icon: ShieldCheck,
    title: 'Deterministic graph writes',
    tagline: 'One entity, one node, always',
    visual: <DeterministicVisual />,
  },
  {
    Icon: BrainCircuit,
    title: 'RRF hybrid retrieval',
    tagline: 'Graph and vectors, fused',
    visual: <RrfVisual />,
  },
  {
    Icon: RefreshCcw,
    title: 'Surgical delta upserts',
    tagline: 'No full re-cognify, ever',
    visual: <DeltaVisual />,
  },
  {
    Icon: GitMerge,
    title: 'Async self-correction loop',
    tagline: 'The graph cleans itself',
    visual: <CorrectionVisual />,
  },
  {
    Icon: MessageSquareText,
    title: 'Memory as typed edges',
    tagline: 'Answers that know you',
    visual: <MemoryVisual />,
  },
];

export default function Showcase() {
  const [active, setActive] = useState(0);

  return (
    <section id="product" className="border-y border-cream-200 bg-cream-100/60 py-20 sm:py-28">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Cognee, engineered further</p>
          <h2 className="display-lg mt-3 text-ink">What we built on top of Cognee</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500">
            Cognee gives us hybrid graph and vector memory. Everything above it is ours: the
            ontology, the sync pipeline, the retrieval planner and the correction loops.
          </p>
        </Reveal>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[1fr_1.35fr]">
          {/* Capability tabs */}
          <div className="flex flex-col gap-1.5">
            {CAPABILITIES.map((cap, i) => (
              <button
                key={cap.title}
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                className={`flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all duration-200 ${
                  i === active
                    ? 'border-cream-300 bg-white shadow-card'
                    : 'border-transparent hover:border-cream-300/60 hover:bg-white/60'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                    i === active ? 'bg-ink text-gold' : 'bg-white text-ink shadow-card'
                  }`}
                >
                  <cap.Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </span>
                <span>
                  <span className="block font-display text-[14.5px] font-medium text-ink">
                    {cap.title}
                  </span>
                  <span
                    className={`block text-[12.5px] ${i === active ? 'text-gold-deep' : 'text-ink-400'}`}
                  >
                    {cap.tagline}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* Active capability panel */}
          <div
            key={active}
            className="animate-panel flex min-h-[320px] flex-col justify-center rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-card sm:p-8"
          >
            {CAPABILITIES[active].visual}
          </div>
        </div>
      </div>
    </section>
  );
}
