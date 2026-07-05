import { Cable, DatabaseZap, Share2, MessagesSquare } from 'lucide-react';
import Reveal from './Reveal';

const STEPS = [
  {
    Icon: Cable,
    step: '01',
    title: 'Connect',
    blurb:
      'Sign in, authorize GitHub and Google, choose repos, docs and channels. A queued backend pipeline starts ingesting immediately.',
  },
  {
    Icon: DatabaseZap,
    step: '02',
    title: 'Ingest',
    blurb:
      'Docling and pymupdf parse every source with structure intact: tables, sections, slide order, thread order.',
  },
  {
    Icon: Share2,
    step: '03',
    title: 'Cognify',
    blurb:
      'Extractors write typed entities and relationships into Cognee, the hybrid vector and graph store that connects PR #418 to PAY-212.',
  },
  {
    Icon: MessagesSquare,
    step: '04',
    title: 'Ask',
    blurb:
      'LangGraph plans the traversal, fuses graph and vector hits with RRF, and Groq generates the answer with citations.',
  },
];

export default function Pipeline() {
  return (
    <section id="how-it-works" className="border-y border-cream-200 bg-white py-20 sm:py-28">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 className="display-lg mt-3 text-ink">Four steps from silos to one graph</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500">
            Your company&rsquo;s knowledge isn&rsquo;t missing. It&rsquo;s scattered. Here&rsquo;s
            how hyperspace stitches it back together.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.step} delay={i * 80}>
              <div className="flex h-full flex-col rounded-xl border border-cream-200 bg-cream-50 p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-ink shadow-card">
                    <s.Icon className="h-5 w-5" strokeWidth={1.7} />
                  </span>
                  <span className="font-display text-sm text-ink-300">{s.step}</span>
                </div>
                <h3 className="mt-5 font-display text-lg font-medium text-ink">{s.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{s.blurb}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
