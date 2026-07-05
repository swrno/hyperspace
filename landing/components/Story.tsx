import Reveal from './Reveal';
import GlowCard, { type GlowVariant } from './GlowCard';
import CountUp from './CountUp';
import { SIGNUP_URL } from '@/lib/site';

const PILLARS: { title: string; blurb: string; glow: GlowVariant }[] = [
  {
    title: 'Grounded',
    blurb: 'Every answer traces back to real nodes: a PR, a ticket, a doc. Nothing invented.',
    glow: 'gold',
  },
  {
    title: 'Smarter every day',
    blurb: 'Entity resolution runs in the background, merging duplicates while you sleep.',
    glow: 'cream',
  },
  {
    title: 'Always in sync',
    blurb: 'The 30-minute delta loop diffs your tools and upserts only what changed.',
    glow: 'bright',
  },
  {
    title: 'Remembers you',
    blurb: 'Cognee memory edges carry your stack, your projects and your preferences across chats.',
    glow: 'deep',
  },
];

const SCENARIOS: { role: string; question: string; path: string; glow: GlowVariant }[] = [
  {
    role: 'Frontend engineer',
    question: '“Which PRs touched the auth flow this sprint, and why?”',
    path: 'GitHub → Jira → Slack',
    glow: 'cream',
  },
  {
    role: 'Product manager',
    question: '“What did we actually promise Acme in the renewal doc?”',
    path: 'Salesforce → Docs → Slides',
    glow: 'gold',
  },
  {
    role: 'Support lead',
    question: '“Is the export bug customers keep hitting fixed yet?”',
    path: 'Slack → Jira → GitHub',
    glow: 'deep',
  },
  {
    role: 'New hire',
    question: '“How do deploys work here, start to finish?”',
    path: 'Docs → GitHub → Slack',
    glow: 'bright',
  },
];

function ChatCard() {
  return (
    <GlowCard glow="gold" className="lg:col-span-2 lg:row-span-2">
      <div className="flex h-full flex-col justify-between gap-6 p-6 sm:p-7">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gold">
            Multi-hop retrieval
          </p>
          <div className="mt-5 space-y-3">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-cream-100 px-4 py-3 text-[13.5px] leading-relaxed text-ink">
              Why did checkout latency spike last Tuesday?
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {['Slack · #incidents', 'Jira · PAY-212', 'GitHub · PR #418'].map((hop) => (
                <span
                  key={hop}
                  className="rounded-md border border-night-line bg-night px-2.5 py-1 text-[11px] text-night-soft"
                >
                  {hop}
                </span>
              ))}
            </div>

            <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-night-line bg-night px-4 py-3.5 text-[13.5px] leading-relaxed text-cream-300">
              The spike traces to the <span className="text-cream-50">StripeGateway refactor</span>{' '}
              merged in <span className="text-cream-50">PR #418</span>. It was flagged in{' '}
              <span className="text-cream-50">#incidents</span>, tracked as{' '}
              <span className="text-cream-50">PAY-212</span>, and resolved by rolling back the
              retry policy the same evening.
            </div>
          </div>
        </div>
        <p className="text-[12px] text-night-soft">Grounded in 3 sources · answered in seconds</p>
      </div>
    </GlowCard>
  );
}

function StatsCard() {
  return (
    <GlowCard glow="bright" className="lg:col-span-2">
      <div className="grid h-full grid-cols-2 gap-y-8 p-6 sm:grid-cols-4 sm:p-7">
        {(
          [
            { end: 6, suffix: '+', label: 'Tools unified' },
            { end: 30, suffix: ' min', label: 'Sync loop' },
            { end: 3, suffix: '+', label: 'Hops per answer' },
            { end: 1, label: 'Source of truth' },
          ] as const
        ).map((s) => (
          <div key={s.label} className="self-center">
            <p className="font-display text-3xl font-medium tracking-tight text-cream-50 sm:text-4xl">
              <CountUp end={s.end} suffix={'suffix' in s ? s.suffix : ''} />
            </p>
            <p className="mt-1.5 text-[12.5px] text-night-soft">{s.label}</p>
          </div>
        ))}
      </div>
    </GlowCard>
  );
}

function CompareCard() {
  return (
    <GlowCard glow="deep" className="lg:col-span-2">
      <div className="flex h-full flex-col p-6 sm:p-7">
        <div className="grid flex-1 grid-cols-2 gap-6">
          <div>
            <p className="text-[12.5px] text-night-soft">Searching by hand</p>
            <p className="mt-2 font-display text-3xl font-medium text-night-soft sm:text-4xl">
              40 min
            </p>
            <p className="mt-1 text-[12px] text-night-soft">of digging per answer</p>
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-cream-200">With hyperspace</p>
            <p className="mt-2 font-display text-3xl font-medium text-cream-50 sm:text-4xl">
              Seconds
            </p>
            <p className="mt-1 text-[12px] text-night-soft">grounded, with sources</p>
          </div>
        </div>
        <div className="mt-6 border-t border-night-line pt-5">
          <a href={SIGNUP_URL} className="btn-bump-gold">
            Get started free
          </a>
        </div>
      </div>
    </GlowCard>
  );
}

export default function Story() {
  return (
    <section id="engine" className="bg-night py-20 text-cream-100 sm:py-28">
      <div className="shell">
        {/* Heading */}
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gold">
            Inside the engine
          </p>
          <h2 className="display-lg mt-3 text-cream-50">A memory that never fragments</h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-night-soft">
            Enterprise search breaks because knowledge lives in five places at once. hyperspace
            keeps it in one living graph: Cognee stores it, LangGraph navigates it, Groq answers
            from it.
          </p>
        </Reveal>

        {/* Bento grid */}
        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ChatCard />

          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 50} className="h-full">
              <GlowCard glow={p.glow} className="h-full">
                <div className="flex h-full flex-col p-6">
                  <span className="block h-px w-8 bg-gold" aria-hidden="true" />
                  <h3 className="mt-4 font-display text-lg font-medium text-cream-50">{p.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-night-soft">{p.blurb}</p>
                </div>
              </GlowCard>
            </Reveal>
          ))}

          <StatsCard />
          <CompareCard />

          {SCENARIOS.map((s, i) => (
            <Reveal key={s.role} delay={i * 50} className="h-full">
              <GlowCard glow={s.glow} className="h-full">
                <div className="flex h-full flex-col justify-between p-6">
                  <p className="font-display text-[15px] font-medium leading-snug text-cream-100">
                    {s.question}
                  </p>
                  <div className="mt-6 border-t border-night-line pt-3">
                    <p className="text-[12.5px] font-semibold text-cream-300">{s.role}</p>
                    <p className="mt-0.5 text-[12px] text-night-soft">{s.path}</p>
                  </div>
                </div>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
