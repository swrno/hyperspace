import Reveal from './Reveal';
import CountUp from './CountUp';

type GlyphKind = 'tools' | 'sync' | 'hops' | 'latency' | 'cite' | 'graph';

type Stat = {
  end?: number;
  /** Non-numeric headline (renders instead of the CountUp figure). */
  text?: string;
  prefix?: string;
  suffix?: string;
  label: string;
  glyph: GlyphKind;
};

const STATS: Stat[] = [
  { end: 6, suffix: '+', label: 'workspace tools normalized into one typed ontology', glyph: 'tools' },
  { text: 'Live', label: 'delta sync loop with surgical upserts, no rebuilds', glyph: 'sync' },
  { end: 3, suffix: '+', label: 'graph hops fused per answer with reciprocal rank fusion', glyph: 'hops' },
  { end: 1, prefix: '<', suffix: ' s', label: 'generation latency on Groq', glyph: 'latency' },
  { end: 100, suffix: '%', label: 'of answers cite the nodes they came from', glyph: 'cite' },
  { end: 1, label: 'Cognee knowledge graph per workspace', glyph: 'graph' },
];

/* Bespoke 32×32 line glyph per metric. Base strokes ride ink-300; the gold
   accents come alive on hover (group-hover) so the grid reads calm at rest. */
function Glyph({ kind }: { kind: GlyphKind }) {
  // Stroke-only spread — fill is always passed explicitly so nothing collides.
  const st = {
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const base = 'text-ink-300 transition-colors duration-300 group-hover:text-ink-400';
  const gold = 'text-gold';

  switch (kind) {
    case 'tools': {
      // Six sources collapsing into one core.
      const ring = [0, 60, 120, 180, 240, 300].map((deg) => {
        const r = 11;
        return {
          x: 16 + r * Math.cos((deg * Math.PI) / 180),
          y: 16 + r * Math.sin((deg * Math.PI) / 180),
        };
      });
      return (
        <svg viewBox="0 0 32 32" className="h-8 w-8">
          <g className={base} {...st}>
            {ring.map((p, i) => (
              <line key={i} x1="16" y1="16" x2={p.x} y2={p.y} strokeWidth={1} />
            ))}
          </g>
          {ring.map((p, i) => (
            <circle key={`c${i}`} className={base} cx={p.x} cy={p.y} r="1.7" fill="#FCFBF9" stroke="currentColor" strokeWidth={1} />
          ))}
          <circle cx="16" cy="16" r="3.4" className={`${gold} hs-breathe`} fill="#C9A66B" fillOpacity="0.18" {...st} />
        </svg>
      );
    }
    case 'sync': {
      // 30-minute loop — a rotating sync arc.
      return (
        <svg viewBox="0 0 32 32" className="h-8 w-8">
          <circle cx="16" cy="16" r="10.5" className={base} fill="none" {...st} strokeDasharray="2 3" />
          <g className={`${gold} hs-spin-slow`} fill="none">
            <path d="M16 5.5 A10.5 10.5 0 0 1 26.5 16" {...st} strokeWidth={1.7} />
            <path d="M26.5 16 l-1.8 -2.4 M26.5 16 l2.3 -1.4" {...st} strokeWidth={1.7} />
          </g>
        </svg>
      );
    }
    case 'hops': {
      // Three-hop traversal with a packet travelling the path.
      const path = 'M6 23 L13 11 L20 21 L27 9';
      return (
        <svg viewBox="0 0 32 32" className="h-8 w-8">
          <path d={path} className={base} fill="none" {...st} />
          {[
            [6, 23],
            [13, 11],
            [20, 21],
            [27, 9],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.8" className={base} fill="#FCFBF9" stroke="currentColor" strokeWidth={1.2} />
          ))}
          <circle r="1.7" fill="#C9A66B">
            <animateMotion dur="2.4s" repeatCount="indefinite" path={path} calcMode="linear" />
          </circle>
        </svg>
      );
    }
    case 'latency': {
      // Sub-second spark.
      return (
        <svg viewBox="0 0 32 32" className="h-8 w-8">
          <path d="M4 16 H11 M21 16 H28" className={base} fill="none" {...st} />
          <path d="M17 4 L9 18 H15 L14 28 L23 13 H16 Z" className={`${gold} hs-pulse`} fill="#C9A66B" fillOpacity="0.16" {...st} strokeWidth={1.5} />
        </svg>
      );
    }
    case 'cite': {
      // Every answer traces back — full ring + check.
      return (
        <svg viewBox="0 0 32 32" className="h-8 w-8">
          <circle cx="16" cy="16" r="11" className={base} fill="none" {...st} strokeWidth={1.2} />
          <circle cx="16" cy="16" r="11" className={gold} fill="none" {...st} strokeWidth={1.8} transform="rotate(-90 16 16)" />
          <path d="M11.5 16.4 L14.6 19.4 L20.5 12.8" className={gold} fill="none" {...st} strokeWidth={1.7} />
        </svg>
      );
    }
    case 'graph': {
      // One graph — a core with orbiting satellites.
      return (
        <svg viewBox="0 0 32 32" className="h-8 w-8">
          <ellipse cx="16" cy="16" rx="12" ry="6" className={base} fill="none" {...st} strokeWidth={1} transform="rotate(-24 16 16)" />
          <g className="hs-spin-slow">
            <circle cx="27" cy="12" r="1.8" className={gold} fill="#C9A66B" />
            <circle cx="5" cy="20" r="1.5" className={base} fill="#FCFBF9" stroke="currentColor" strokeWidth={1.2} />
          </g>
          <circle cx="16" cy="16" r="4" className={`${gold} hs-breathe`} fill="#C9A66B" fillOpacity="0.18" {...st} strokeWidth={1.6} />
        </svg>
      );
    }
  }
}

export default function Stats() {
  return (
    <section className="relative overflow-hidden border-y border-cream-200 bg-cream-100/70 py-20 sm:py-24">
      {/* faint graph-paper wash */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(26,25,23,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(26,25,23,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="shell relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">By the numbers</p>
          <h2 className="display-lg mt-3 text-ink">Numbers from the engine, not the pitch deck</h2>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={(i % 3) * 70}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-cream-200 bg-white/60 p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-gold/45 hover:bg-white hover:shadow-lift">
                {/* hover glow */}
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(201,166,107,0.22),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative flex items-start justify-between">
                  <p className="font-display text-5xl font-medium tracking-tight text-ink">
                    {stat.text ? stat.text : <CountUp end={stat.end ?? 0} prefix={stat.prefix} suffix={stat.suffix} />}
                  </p>
                  <Glyph kind={stat.glyph} />
                </div>

                {/* gold data-flow underline that sweeps in on hover */}
                <div className="relative mt-4 h-px w-full bg-cream-200">
                  <div className="dash-line absolute inset-0 origin-left scale-x-0 opacity-0 transition-[transform,opacity] duration-500 group-hover:scale-x-100 group-hover:opacity-100" />
                </div>

                <p className="mt-4 max-w-[17rem] text-[13.5px] leading-relaxed text-ink-500">
                  {stat.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
