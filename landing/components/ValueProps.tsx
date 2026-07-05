import { GitMerge, Layers, RefreshCcw, Waypoints } from 'lucide-react';
import Reveal from './Reveal';

const PROPS = [
  {
    Icon: Waypoints,
    title: 'Multi-hop by design',
    blurb:
      'Retrieval follows real edges: from a Slack thread to the Jira ticket to the merged PR that closed it.',
  },
  {
    Icon: Layers,
    title: 'Structure survives ingestion',
    blurb:
      'Docling and pymupdf keep tables, sections and slide order intact, so slide 14 still knows what slide 2 promised.',
  },
  {
    Icon: RefreshCcw,
    title: 'Fresh every 30 minutes',
    blurb:
      'A delta loop diffs each platform and upserts only what changed. A merged PR flips to MERGED without a rebuild.',
  },
  {
    Icon: GitMerge,
    title: 'Self-correcting by default',
    blurb:
      'Background entity resolution merges duplicates and prunes dangling edges before they rot the graph.',
  },
];

export default function ValueProps() {
  return (
    <section className="py-20 sm:py-28">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <h2 className="display-lg text-ink">
            Workspace search is broken.
            <br />
            <span className="text-ink-400">Flat vector RAG can&rsquo;t follow the thread.</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-500">
            Cosine similarity over text chunks misses how work actually connects. hyperspace
            models the connections themselves: typed entities and edges it can reason across.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-x-8 gap-y-10 border-t border-cream-200 pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {PROPS.map((p, i) => (
            <Reveal key={p.title} delay={i * 60}>
              <p.Icon className="h-5 w-5 text-ink" strokeWidth={1.7} />
              <h3 className="mt-4 font-display text-[16px] font-medium text-ink">{p.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{p.blurb}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
