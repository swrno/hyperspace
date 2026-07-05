import { ArrowRight } from 'lucide-react';
import Reveal from './Reveal';
import GradientArt from './GradientArt';
import { DOCS_URL } from '@/lib/site';

/** Mini visual: entity chips being merged by the self-correction engine. */
function MergeVisual() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md border border-cream-300 bg-cream-50 px-2.5 py-1 text-[11px] text-ink-500 line-through decoration-ink-300">
          &ldquo;payment flow&rdquo;
        </span>
        <span className="rounded-md border border-cream-300 bg-cream-50 px-2.5 py-1 text-[11px] text-ink-500 line-through decoration-ink-300">
          &ldquo;StripeGateway&rdquo;
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
        <span className="rounded-md bg-ink px-2.5 py-1 text-[11px] font-semibold text-cream-50">
          PaymentGateway
        </span>
        <span className="text-[11px] text-ink-400">merged entity</span>
      </div>
    </div>
  );
}

/** Mini visual: the 30-minute delta sync timeline. */
function SyncVisual() {
  return (
    <div>
      <div className="flex items-center gap-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className={`h-6 flex-1 rounded-sm ${
              i === 4 || i === 9 ? 'bg-gold' : i % 3 === 0 ? 'bg-cream-300' : 'bg-cream-200'
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
        <span>Poll, diff, upsert</span>
        <span className="font-semibold text-ink-600">Every 30 minutes</span>
      </div>
    </div>
  );
}

/** Mini visual: a multi-hop path across tools. */
function HopVisual() {
  const hops = ['#incidents', 'PAY-212', 'PR #418'];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hops.map((hop, i) => (
        <span key={hop} className="flex items-center gap-1.5">
          <span className="rounded-md border border-cream-300 bg-cream-50 px-2.5 py-1.5 text-[11px] text-ink-600">
            {hop}
          </span>
          {i < hops.length - 1 && <ArrowRight className="h-3 w-3 text-ink-300" />}
        </span>
      ))}
      <ArrowRight className="h-3 w-3 text-ink-300" />
      <span className="rounded-md bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-cream-50">
        Answer
      </span>
    </div>
  );
}

/** Mini visual: personal memory edges. */
function MemoryVisual() {
  return (
    <div className="space-y-1.5 font-mono text-[10.5px] text-ink-500">
      <p>
        (you) <span className="text-gold-deep">-[:PREFERS]-&gt;</span> (Python)
      </p>
      <p>
        (you) <span className="text-gold-deep">-[:WORKS_ON]-&gt;</span> (frontend-app)
      </p>
      <p>
        (you) <span className="text-gold-deep">-[:ASKED_ABOUT]-&gt;</span> (auth flow)
      </p>
    </div>
  );
}

/** Mini visual: SDK code snippet. */
function SdkVisual() {
  return (
    <pre className="overflow-x-auto rounded-xl bg-ink p-3.5 font-mono text-[10.5px] leading-relaxed text-cream-200">
      <code>{`import { Hypr } from "hypr-sdk";

const hypr = new Hypr({ apiKey });
const res = await hypr.retrieve(
  "what shipped last sprint?"
);`}</code>
    </pre>
  );
}

/** Graph studio card: gradient art cover with a constellation overlay. */
function StudioVisual() {
  return (
    <div className="relative h-full min-h-[120px] overflow-hidden rounded-xl">
      <div className="absolute inset-0">
        <GradientArt id="studio" variant="sage" />
      </div>
      <svg
        viewBox="0 0 220 90"
        className="relative h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <g stroke="#1A1917" strokeOpacity="0.45" strokeWidth="1">
          <line x1="30" y1="60" x2="85" y2="28" />
          <line x1="85" y1="28" x2="140" y2="55" />
          <line x1="140" y1="55" x2="195" y2="25" />
          <line x1="85" y1="28" x2="120" y2="75" />
          <line x1="140" y1="55" x2="120" y2="75" />
          <line x1="30" y1="60" x2="120" y2="75" />
        </g>
        <circle cx="30" cy="60" r="7" fill="#1A1917" />
        <circle cx="85" cy="28" r="9" fill="#FFFFFF" />
        <circle cx="140" cy="55" r="7" fill="#1A1917" />
        <circle cx="195" cy="25" r="6" fill="#1A1917" fillOpacity="0.6" />
        <circle cx="120" cy="75" r="5" fill="#1A1917" fillOpacity="0.6" />
      </svg>
    </div>
  );
}

const CARDS = [
  {
    title: 'Knowledge Graph Studio',
    blurb:
      'Explore every entity and edge Cognee extracted, in 3D, with Louvain community detection coloring the clusters.',
    visual: <StudioVisual />,
    span: 'lg:col-span-2',
  },
  {
    title: 'Multi-hop answers',
    blurb: 'Follows RESOLVES and MENTIONS edges from a Slack thread to the ticket to the merged PR.',
    visual: <HopVisual />,
    span: '',
  },
  {
    title: 'Delta sync',
    blurb: 'Surgical upserts flip a PR node from OPEN to MERGED without rebuilding the graph.',
    visual: <SyncVisual />,
    span: '',
  },
  {
    title: 'Self-correction engine',
    blurb:
      'Entity resolution merges "payment flow" and "StripeGateway" into one node and keeps both source attributions.',
    visual: <MergeVisual />,
    span: '',
  },
  {
    title: 'Conversational memory',
    blurb: 'Person-specific facts become Cognee memory edges that ground every later query.',
    visual: <MemoryVisual />,
    span: '',
  },
  {
    title: 'hypr SDK & API keys',
    blurb: 'The same ingestion and retrieval engine, exposed through API keys and hypr-sdk.',
    visual: <SdkVisual />,
    span: 'lg:col-span-2',
  },
];

export default function Bento() {
  return (
    <section className="py-20 sm:py-28">
      <div className="shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Everything in the box</p>
          <h2 className="display-lg mt-3 text-ink">A full engine, not just a chatbox</h2>
        </Reveal>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card, i) => (
            <Reveal key={card.title} delay={(i % 4) * 60} className={card.span}>
              <div className="card flex h-full flex-col justify-between gap-5 p-5 sm:p-6">
                <div className="min-h-[84px]">{card.visual}</div>
                <div>
                  <h3 className="font-display text-[15px] font-medium text-ink">{card.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{card.blurb}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 text-center">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-display text-sm font-medium text-ink underline decoration-cream-400 underline-offset-4 transition hover:decoration-ink"
          >
            Explore the docs
            <ArrowRight className="h-4 w-4" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
