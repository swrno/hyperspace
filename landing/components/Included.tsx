import { Check } from 'lucide-react';
import Reveal from './Reveal';

const INCLUDED = [
  'Hosted ingestion pipelines and sync loops',
  'Typed graph storage with Cognee',
  'Hybrid retrieval through LangGraph and Groq',
  'Docs, API reference and SDK access',
];

export default function Included() {
  return (
    <section className="py-20 sm:py-28">
      <div className="shell">
        <Reveal className="grid gap-8 rounded-3xl border border-cream-200 bg-white p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow">Included</p>
            <h2 className="display-lg mt-3 text-ink">Everything needed to ship a knowledge engine</h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500">
              The landing experience reflects the product: the graph, the connectors, the docs and
              the retrieval layer all work together out of the box.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {INCLUDED.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3.5"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold-deep">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
                <span className="text-[13.5px] leading-relaxed text-ink-600">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}