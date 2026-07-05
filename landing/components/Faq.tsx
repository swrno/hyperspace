'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import Reveal from './Reveal';

const FAQS = [
  {
    q: 'What exactly is hyperspace?',
    a: 'hyperspace is an enterprise knowledge engine. It ingests GitHub, Jira, Slack, Google Docs, Slides and Salesforce into one typed knowledge graph and answers plain-language questions with citations back to the exact nodes the answer came from.',
  },
  {
    q: 'How is this different from normal AI search or RAG?',
    a: 'Standard RAG embeds text chunks and hopes cosine similarity finds the right one. hyperspace extracts entities and relationships, then walks them: graph lookups and vector search run in parallel, both rankings are fused with reciprocal rank fusion, and LangGraph keeps hopping edges until the context is complete.',
  },
  {
    q: 'What did you build on top of Cognee?',
    a: 'Cognee provides the hybrid graph and vector store. On top of it we engineered a typed enterprise ontology (Repositories, PullRequests, Issues, Documents, Channels, Accounts), deterministic entity writes so the same PR never becomes two nodes, a 30-minute delta sync with surgical upserts instead of full re-cognify runs, an async self-correction loop that merges duplicate entities, and a personal memory layer stored as typed graph edges.',
  },
  {
    q: 'How fresh is the knowledge graph?',
    a: 'A sync loop polls every connected platform every 30 minutes, computes a diff against known state, and upserts only the nodes and edges that changed. A merged PR flips from OPEN to MERGED without touching historical context.',
  },
  {
    q: 'What keeps the graph from getting messy over time?',
    a: 'A background LangGraph pass continuously scans sub-graphs. Duplicate entities like "payment flow" and "StripeGateway" get merged into one node with both source attributions kept, and dangling edges from deleted messages get pruned. The graph cleans itself.',
  },
  {
    q: 'Can I build on top of it?',
    a: 'Yes. The same ingestion and retrieval engine is exposed through API keys and hypr-sdk, so you can ship graph-grounded answers inside your own product. The docs cover the full API surface.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-cream-300/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-6 py-5 text-left"
        aria-expanded={open}
      >
        <span className="font-display text-[15.5px] font-medium text-ink sm:text-[17px]">{q}</span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cream-300 text-ink transition-transform duration-300 ${
            open ? 'rotate-45 bg-ink text-cream-50' : ''
          }`}
        >
          <Plus className="h-4 w-4" />
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? 'grid-rows-[1fr] pb-5 opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl text-[14px] leading-relaxed text-ink-500">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function Faq() {
  return (
    <section id="faq" className="py-20 sm:py-28">
      <div className="shell grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <p className="eyebrow">FAQs</p>
          <h2 className="display-lg mt-3 text-ink">Questions, answered</h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-500">
            The short version: your tools stay where they are. hyperspace finally connects
            what&rsquo;s inside them.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="border-t border-cream-300/70">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
