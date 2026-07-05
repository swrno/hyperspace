import { ArrowRight, Github, FileText, GitBranch, Slack, Database, MessageSquare } from 'lucide-react';
import Reveal from './Reveal';

const CONNECTORS = [
  { Icon: Github, label: 'GitHub' },
  { Icon: FileText, label: 'Docs' },
  { Icon: GitBranch, label: 'Jira' },
  { Icon: Slack, label: 'Slack' },
  { Icon: Database, label: 'Google Drive' },
  { Icon: MessageSquare, label: 'Chat' },
];

export default function Connectors() {
  return (
    <section id="connectors" className="border-y border-cream-200 bg-cream-100/40 py-20 sm:py-28">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Connectors</p>
          <h2 className="display-lg mt-3 text-ink">One graph across every source of truth</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500">
            hyperspace ingests the systems your team already uses, then turns them into typed
            entities and edges Cognee can answer from.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTORS.map(({ Icon, label }, index) => (
            <Reveal key={label} delay={index * 40}>
              <div className="card flex items-center gap-4 p-5 sm:p-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cream-300 bg-white text-ink shadow-sm">
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[15px] font-medium text-ink">{label}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                    Normalized into the same graph model.
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8">
          <a
            href="#engine"
            className="inline-flex items-center gap-1.5 font-display text-sm font-medium text-ink underline decoration-cream-400 underline-offset-4 transition hover:decoration-ink"
          >
            See how the engine uses them
            <ArrowRight className="h-4 w-4" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}