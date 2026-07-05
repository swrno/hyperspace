import Reveal from './Reveal';
import CountUp from './CountUp';

const STATS: { end: number; prefix?: string; suffix?: string; label: string }[] = [
  { end: 6, suffix: '+', label: 'workspace tools normalized into one typed ontology' },
  { end: 30, suffix: ' min', label: 'delta sync loop with surgical upserts, no rebuilds' },
  { end: 3, suffix: '+', label: 'graph hops fused per answer with reciprocal rank fusion' },
  { end: 1, prefix: '<', suffix: ' s', label: 'generation latency on Groq' },
  { end: 100, suffix: '%', label: 'of answers cite the nodes they came from' },
  { end: 1, label: 'Cognee knowledge graph per workspace' },
];

export default function Stats() {
  return (
    <section className="border-y border-cream-200 bg-cream-100/70 py-20 sm:py-24">
      <div className="shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="display-lg text-ink">Numbers from the engine, not the pitch deck</h2>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={(i % 3) * 60}>
              <div className="border-t border-ink/15 pt-5">
                <p className="font-display text-5xl font-medium tracking-tight text-ink">
                  <CountUp end={s.end} prefix={s.prefix} suffix={s.suffix} />
                </p>
                <p className="mt-2.5 max-w-[16rem] text-[13.5px] leading-relaxed text-ink-500">
                  {s.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
