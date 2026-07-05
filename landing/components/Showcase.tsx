import {
  BrainCircuit,
  GitMerge,
  MessageSquareText,
  Network,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import Reveal from './Reveal';
import { LogoMark } from './LogoMark';
import { GitHubIcon, JiraIcon, SlackIcon } from './SourceIcons';

const CAPABILITIES = [
  {
    Icon: Network,
    title: 'Typed enterprise ontology',
    blurb:
      'A strict schema of Repositories, PullRequests, Issues, Documents, Channels and Accounts, with edges like RESOLVES and DISCUSSION_IN.',
  },
  {
    Icon: ShieldCheck,
    title: 'Deterministic graph writes',
    blurb:
      'Extractors resolve entities before writing, so PR #418 lands as one node no matter how many tools mention it.',
  },
  {
    Icon: BrainCircuit,
    title: 'RRF hybrid retrieval',
    blurb:
      'LangGraph runs Cognee graph lookups and vector search in parallel, then fuses both rankings with reciprocal rank fusion.',
  },
  {
    Icon: RefreshCcw,
    title: 'Surgical delta upserts',
    blurb:
      'A 30-minute diff loop updates only changed nodes and edges. No full re-cognify, ever.',
  },
  {
    Icon: GitMerge,
    title: 'Async self-correction loop',
    blurb:
      'A background LangGraph pass resolves duplicate entities, merges them inside Cognee and prunes orphans.',
  },
  {
    Icon: MessageSquareText,
    title: 'Memory as typed edges',
    blurb:
      'Person-specific facts become edges like (you)-[:WORKS_ON]->(frontend-app) and ground every later answer.',
  },
];

/** Stylized product mock: sidebar + chat pane answering a multi-hop question. */
function AppMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-lift">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-cream-200 bg-white px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-cream-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-cream-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-cream-300" />
        <span className="ml-3 rounded-md bg-cream-100 px-2.5 py-1 text-[11px] text-ink-400">
          app.hyperspace.ai
        </span>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-44 shrink-0 flex-col gap-1 border-r border-cream-200 bg-white p-3 sm:flex">
          <div className="mb-2 flex items-center gap-1.5 px-2 text-ink">
            <LogoMark className="h-4 w-4" />
            <span className="font-display text-[13px] font-medium">hyperspace</span>
          </div>
          {['Chat', 'Knowledge bases', 'Graph studio', 'Mind map', 'API keys'].map((item, i) => (
            <span
              key={item}
              className={`rounded-lg px-2.5 py-1.5 text-[12px] ${
                i === 0 ? 'bg-cream-100 font-semibold text-ink' : 'text-ink-500'
              }`}
            >
              {item}
            </span>
          ))}
          <div className="mt-4 border-t border-cream-200 pt-3">
            <p className="px-2.5 text-[11px] font-semibold text-ink-400">Sources</p>
            <div className="mt-2 flex items-center gap-2 px-2.5 text-ink-500">
              <GitHubIcon className="h-3.5 w-3.5" />
              <JiraIcon className="h-3.5 w-3.5" />
              <SlackIcon className="h-3.5 w-3.5" />
              <span className="text-[10px]">+3</span>
            </div>
          </div>
        </div>

        {/* Chat pane */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[12.5px] leading-relaxed text-cream-50">
            What changed in the payments flow this sprint, and does it affect the Acme contract?
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {['Jira · PAY-212', 'GitHub · PR #418', 'Docs · Acme MSA', 'Slack · #payments'].map((chip) => (
              <span
                key={chip}
                className="rounded-md border border-cream-300 bg-white px-2 py-1 text-[10.5px] text-ink-500"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-cream-200 bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-700 shadow-card">
            The <span className="font-semibold">StripeGateway retry policy</span> was refactored in{' '}
            <span className="font-semibold">PR #418</span> (closes PAY-212). The Acme MSA guarantees
            a 99.9% checkout SLA. Rollout notes in #payments confirm the change was load-tested
            against it, so <span className="font-semibold">no contract impact</span>.
            <p className="mt-2 border-t border-cream-200 pt-2 text-[11px] text-ink-400">
              4 sources · 3 hops
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Showcase() {
  return (
    <section id="product" className="border-y border-cream-200 bg-cream-100/60 py-20 sm:py-28">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Cognee, engineered further</p>
          <h2 className="display-lg mt-3 text-ink">
            We didn&rsquo;t just call cognify(). We built an engine around it.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500">
            Cognee gives us hybrid graph and vector memory. Everything above it is ours: the
            ontology, the sync pipeline, the retrieval planner and the correction loops.
          </p>
        </Reveal>

        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.5fr_1fr]">
          <Reveal>
            <AppMock />
          </Reveal>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
            {CAPABILITIES.map((cap, i) => (
              <Reveal key={cap.title} delay={i * 50}>
                <div className="flex items-start gap-3.5 rounded-xl border border-transparent p-3.5 transition hover:border-cream-300 hover:bg-white">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-ink shadow-card">
                    <cap.Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <div>
                    <h3 className="font-display text-[14.5px] font-medium text-ink">{cap.title}</h3>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">{cap.blurb}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
