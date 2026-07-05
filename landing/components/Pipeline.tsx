'use client';

import { useEffect, useState } from 'react';
import { Cable, DatabaseZap, Share2, MessagesSquare } from 'lucide-react';
import Reveal from './Reveal';

const STEPS = [
  {
    Icon: Cable,
    step: '01',
    title: 'Connect',
    blurb:
      'Sign in, authorize GitHub and Google, choose repos, docs and channels. A queued backend pipeline starts ingesting immediately.',
    chips: ['OAuth', 'Repo picker', 'Queued pipeline'],
  },
  {
    Icon: DatabaseZap,
    step: '02',
    title: 'Ingest',
    blurb:
      'Docling and pymupdf parse every source with structure intact: tables, sections, slide order, thread order.',
    chips: ['Docling', 'pymupdf', 'Structure preserved'],
  },
  {
    Icon: Share2,
    step: '03',
    title: 'Cognify',
    blurb:
      'Extractors write typed entities and relationships into Cognee, the hybrid vector and graph store that connects PR #418 to PAY-212.',
    chips: ['Typed entities', 'Cognee graph', 'Deterministic writes'],
  },
  {
    Icon: MessagesSquare,
    step: '04',
    title: 'Ask',
    blurb:
      'LangGraph plans the traversal, fuses graph and vector hits with RRF, and Groq generates the answer with citations.',
    chips: ['LangGraph', 'RRF fusion', 'Groq inference'],
  },
];

const CYCLE_MS = 4000;

export default function Pipeline() {
  const [active, setActive] = useState(0);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [epoch]);

  const select = (i: number) => {
    setActive(i);
    setEpoch((e) => e + 1);
  };

  const current = STEPS[active];

  return (
    <section id="how-it-works" className="border-y border-cream-200 bg-white py-20 sm:py-28">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 className="display-lg mt-3 text-ink">Four steps from silos to one graph</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500">
            Your company&rsquo;s knowledge isn&rsquo;t missing. It&rsquo;s scattered. Watch how
            hyperspace stitches it back together.
          </p>
        </Reveal>

        {/* Flow rail */}
        <div className="mt-14 flex items-center gap-2 sm:gap-3">
          {STEPS.map((s, i) => (
            <div key={s.step} className="contents">
              <button
                type="button"
                onClick={() => select(i)}
                aria-pressed={i === active}
                className={`flex shrink-0 flex-col items-center gap-2.5 rounded-xl px-2 py-1 transition sm:px-3 ${
                  i === active ? '' : 'opacity-60 hover:opacity-100'
                }`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-300 sm:h-14 sm:w-14 ${
                    i === active
                      ? 'scale-110 bg-ink text-gold shadow-lift'
                      : 'border border-cream-300 bg-cream-50 text-ink'
                  }`}
                >
                  <s.Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.7} />
                </span>
                <span
                  className={`font-display text-[12px] font-medium sm:text-[13px] ${
                    i === active ? 'text-ink' : 'text-ink-400'
                  }`}
                >
                  {s.title}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="dash-line h-px min-w-4 flex-1" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        {/* Active step detail */}
        <div
          key={`${active}-${epoch}`}
          className="animate-panel mt-8 overflow-hidden rounded-2xl border border-cream-200 bg-cream-50"
        >
          <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
            <p className="font-display text-5xl font-medium tracking-tight text-cream-400 sm:text-6xl">
              {current.step}
            </p>
            <div>
              <h3 className="font-display text-xl font-medium text-ink">{current.title}</h3>
              <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">
                {current.blurb}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {current.chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-md border border-cream-300 bg-white px-2.5 py-1 text-[11.5px] text-ink-600"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <span className="step-progress block h-[3px] w-full bg-gold" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
