import Reveal from './Reveal';

type GlyphKind = 'multihop' | 'structure' | 'fresh' | 'selfcorrect';

const PROPS: { glyph: GlyphKind; title: string; blurb: string }[] = [
  {
    glyph: 'multihop',
    title: 'Multi-hop by design',
    blurb:
      'Retrieval follows real edges: from a Slack thread to the Jira ticket to the merged PR that closed it.',
  },
  {
    glyph: 'structure',
    title: 'Structure survives ingestion',
    blurb:
      'Docling and pymupdf keep tables, sections and slide order intact, so slide 14 still knows what slide 2 promised.',
  },
  {
    glyph: 'fresh',
    title: 'Fresh every 30 minutes',
    blurb:
      'A delta loop diffs each platform and upserts only what changed. A merged PR flips to MERGED without a rebuild.',
  },
  {
    glyph: 'selfcorrect',
    title: 'Self-correcting by default',
    blurb:
      'Background entity resolution merges duplicates and prunes dangling edges before they rot the graph.',
  },
];

/* 40×40 line glyph per value prop. Ink base stays quiet; gold accents lift on
   group-hover so the row reads calm until you engage with a card. */
function Glyph({ kind }: { kind: GlyphKind }) {
  // Stroke-only spread — fill is always passed explicitly so nothing collides.
  const st = {
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const base = 'text-ink-300 transition-colors duration-300 group-hover:text-ink-500';
  const gold = 'text-gold';

  switch (kind) {
    case 'multihop': {
      const path = 'M8 30 L20 15 L32 25';
      return (
        <svg viewBox="0 0 40 40" className="h-6 w-6">
          <path d={path} className={base} fill="none" {...st} />
          <circle cx="8" cy="30" r="2.4" className={base} fill="#FFFFFF" {...st} />
          <circle cx="20" cy="15" r="2.4" className={base} fill="#FFFFFF" {...st} />
          <circle cx="32" cy="25" r="2.6" className={gold} fill="#C9A66B" fillOpacity="0.18" {...st} />
          <circle r="2" fill="#C9A66B">
            <animateMotion dur="2.6s" repeatCount="indefinite" path={path} calcMode="linear" />
          </circle>
        </svg>
      );
    }
    case 'structure':
      return (
        <svg viewBox="0 0 40 40" className="h-6 w-6">
          <g className={base} fill="none" {...st}>
            <rect x="8" y="9" width="24" height="7" rx="2" />
            <rect x="8" y="26" width="24" height="7" rx="2" />
            <line x1="12" y1="12.5" x2="24" y2="12.5" strokeWidth={1.2} />
            <line x1="12" y1="29.5" x2="20" y2="29.5" strokeWidth={1.2} />
          </g>
          <g className={gold} {...st}>
            <rect x="8" y="17.5" width="24" height="7" rx="2" fill="#C9A66B" fillOpacity="0.12" />
            <line x1="12" y1="21" x2="26" y2="21" strokeWidth={1.2} />
          </g>
        </svg>
      );
    case 'fresh':
      return (
        <svg viewBox="0 0 40 40" className="h-6 w-6">
          <g className={`${gold} hs-spin-slow`} fill="none">
            <path d="M20 8 A12 12 0 0 1 32 20" {...st} />
            <path d="M32 20 l-2.2 -3 M32 20 l3 -1.8" {...st} />
            <path d="M20 32 A12 12 0 0 1 8 20" {...st} />
            <path d="M8 20 l2.2 3 M8 20 l-3 1.8" {...st} />
          </g>
          <circle cx="20" cy="20" r="2.4" className={base} fill="#FFFFFF" {...st} />
        </svg>
      );
    case 'selfcorrect':
      return (
        <svg viewBox="0 0 40 40" className="h-6 w-6">
          <circle cx="15" cy="20" r="6.5" className={base} fill="none" {...st} strokeDasharray="2 2.4" />
          <circle cx="23" cy="20" r="6.5" className={base} fill="none" {...st} strokeDasharray="2 2.4" />
          <circle cx="19" cy="20" r="3" className={gold} fill="#C9A66B" fillOpacity="0.2" {...st} />
          <path d="M30 14 a8 8 0 0 1 0 12" className={`${gold} hs-pulse`} fill="none" {...st} strokeWidth={1.4} />
        </svg>
      );
  }
}

export default function ValueProps() {
  return (
    <section className="py-20 sm:py-28">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <h2 className="display-lg text-ink">
            Workspace search is broken.
            <br />
            <span className="text-ink-400">Flat vector RAG can&rsquo;t follow </span>
            <span className="text-sheen">the thread.</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-500">
            Cosine similarity over text chunks misses how work actually connects. hyperspace
            models the connections themselves: typed entities and edges it can reason across.
          </p>
        </Reveal>

        {/* Thread motif: disconnected chunks on the left resolve into a linked,
            traversable path on the right — the section's thesis, made visual. */}
        <Reveal className="mt-12" delay={80}>
          <svg viewBox="0 0 800 44" preserveAspectRatio="none" className="h-11 w-full" aria-hidden="true">
            {/* flat RAG: scattered, unlinked chunks */}
            <g className="text-ink-300" fill="currentColor">
              <circle cx="40" cy="14" r="3" />
              <circle cx="95" cy="30" r="3" />
              <circle cx="150" cy="12" r="3" />
              <circle cx="205" cy="26" r="3" />
              <circle cx="255" cy="18" r="3" />
            </g>
            {/* the graph: the same points, now threaded */}
            <path
              d="M330 22 L410 12 L490 30 L570 14 L660 26 L760 18"
              fill="none"
              stroke="#C9A66B"
              strokeOpacity="0.55"
              strokeWidth="1.5"
              strokeDasharray="3 4"
              className="hs-flow-in"
              strokeLinecap="round"
            />
            <g fill="#C9A66B">
              {[
                [330, 22],
                [410, 12],
                [490, 30],
                [570, 14],
                [660, 26],
                [760, 18],
              ].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="3.2" />
              ))}
            </g>
            <circle r="2.6" fill="#8F7444">
              <animateMotion
                dur="3.2s"
                repeatCount="indefinite"
                path="M330 22 L410 12 L490 30 L570 14 L660 26 L760 18"
                calcMode="linear"
              />
            </circle>
          </svg>
          <div className="mt-2 flex justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-ink-400">
            <span>Flat vector RAG · loose chunks</span>
            <span className="text-gold">hyperspace · linked graph</span>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROPS.map((p, i) => (
            <Reveal key={p.title} delay={i * 70}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-cream-200 bg-white/60 p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-gold/45 hover:bg-white hover:shadow-lift">
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(201,166,107,0.20),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <span className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-cream-200 bg-cream-50 shadow-sm transition-colors duration-300 group-hover:border-gold/40 group-hover:bg-white">
                  <Glyph kind={p.glyph} />
                </span>
                <h3 className="relative mt-5 font-display text-[16px] font-medium text-ink">{p.title}</h3>
                <p className="relative mt-2 text-[13.5px] leading-relaxed text-ink-500">{p.blurb}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
