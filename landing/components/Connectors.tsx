import { ArrowRight } from 'lucide-react';
import Reveal from './Reveal';
import { LogoMark } from './LogoMark';
import {
  DocsColorIcon,
  GitHubColorIcon,
  JiraColorIcon,
  SalesforceColorIcon,
  SlackColorIcon,
  SlidesColorIcon,
} from './SourceIcons';

const CONNECTORS = [
  { Icon: GitHubColorIcon, label: 'GitHub', note: 'Code, issues, PRs' },
  { Icon: DocsColorIcon, label: 'Google Docs', note: 'Specs and runbooks' },
  { Icon: JiraColorIcon, label: 'Jira', note: 'Tasks and delivery' },
  { Icon: SlackColorIcon, label: 'Slack', note: 'Decisions in motion' },
  { Icon: SlidesColorIcon, label: 'Slides', note: 'Presentations and decisions' },
  { Icon: SalesforceColorIcon, label: 'Salesforce', note: 'Accounts and activity' },
];

// x/y are % positions (icon nodes) AND the SVG viewBox coords (0–100), so the
// edges + data packets line up with the icons exactly.
const NODES = [
  { x: 50, y: 12 },
  { x: 80, y: 28 },
  { x: 80, y: 68 },
  { x: 50, y: 86 },
  { x: 20, y: 68 },
  { x: 20, y: 28 },
] as const;

export default function Connectors() {
  return (
    <section id="connectors" className="border-y border-cream-200 bg-cream-100/40 py-16 sm:py-20 lg:py-28">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Connectors</p>
          <h2 className="display-lg mt-3 text-ink">One graph across every source of truth</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500">
            hyperspace ingests the systems your team already uses, then turns them into typed
            entities and edges Cognee can answer from.
          </p>
        </Reveal>

        <div className="mt-12">
          <Reveal className="card overflow-hidden p-4 sm:p-6 lg:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(201,166,107,0.14),_transparent_55%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(26,25,23,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(26,25,23,0.045)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />

            <div className="relative z-10">
              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] border border-cream-200 bg-white/85 p-4 shadow-card sm:min-h-[500px] sm:p-6 lg:min-h-[620px] lg:p-8">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 100 100"
                    className="absolute inset-0 h-full w-full"
                    preserveAspectRatio="none"
                  >
                    {/* Static faint spokes so structure stays legible at rest. */}
                    <g stroke="#E7DDD0" strokeWidth="0.6" strokeLinecap="round">
                      {NODES.map((n, i) => (
                        <line key={`b${i}`} x1="50" y1="50" x2={n.x} y2={n.y} />
                      ))}
                    </g>
                    {/* Gold dashes crawling inward — data flowing to the core. */}
                    <g
                      className="hs-flow-in"
                      stroke="#C9A66B"
                      strokeOpacity="0.5"
                      strokeWidth="0.75"
                      strokeDasharray="1.6 3.8"
                      strokeLinecap="round"
                    >
                      {NODES.map((n, i) => (
                        <line key={`f${i}`} x1="50" y1="50" x2={n.x} y2={n.y} />
                      ))}
                    </g>

                    {/* Concentric core rings + radar pings. */}
                    <circle cx="50" cy="50" r="20.5" fill="none" stroke="#E7DDD0" strokeWidth="0.8" />
                    <circle cx="50" cy="50" r="9" fill="none" stroke="#D2A85A" strokeOpacity="0.5" strokeWidth="0.6" className="hs-ping" />
                    <circle cx="50" cy="50" r="9" fill="none" stroke="#D2A85A" strokeOpacity="0.5" strokeWidth="0.6" className="hs-ping" style={{ animationDelay: '1.7s' }} />
                    <circle cx="50" cy="50" r="4" fill="#D2A85A" fillOpacity="0.18" stroke="#D2A85A" strokeWidth="0.8" />

                    {/* Data packets streaming from each source into the graph. */}
                    {NODES.map((n, i) => (
                      <circle key={`p${i}`} r="1.05" fill="#C9A66B">
                        <animateMotion
                          dur="2.6s"
                          begin={`${i * 0.42}s`}
                          repeatCount="indefinite"
                          path={`M${n.x},${n.y} L50,50`}
                          calcMode="linear"
                        />
                        <animate
                          attributeName="opacity"
                          dur="2.6s"
                          begin={`${i * 0.42}s`}
                          repeatCount="indefinite"
                          values="0;1;1;0"
                          keyTimes="0;0.15;0.8;1"
                        />
                      </circle>
                    ))}
                  </svg>

                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-cream-200 bg-white px-3 py-1 text-[11px] font-medium text-ink-500 shadow-sm sm:left-5 sm:top-5">
                    <span className="h-2 w-2 rounded-full bg-gold hs-pulse" />
                    Connected memory map
                  </div>

                  {NODES.map((node, index) => {
                    const { Icon, label } = CONNECTORS[index];
                    return (
                      <div
                        key={label}
                        className="absolute z-10"
                        style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%, -50%)' }}
                      >
                        <div
                          className="hs-float group/node relative flex flex-col items-center gap-2 text-center"
                          style={{ animationDelay: `${index * 0.6}s` }}
                        >
                          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cream-300 bg-white shadow-sm transition-transform duration-300 group-hover/node:scale-110 sm:h-14 sm:w-14">
                            <Icon className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5" />
                          </span>
                          <span className="rounded-full border border-cream-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-ink-500 shadow-sm backdrop-blur">
                            {label}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Breathing glow behind the core. */}
                  <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(201,166,107,0.28),transparent_70%)] hs-breathe" />

                  <div className="absolute left-1/2 top-1/2 z-20 flex w-[190px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-[1.75rem] border border-cream-200 bg-cream-50 px-5 py-6 text-center shadow-card sm:w-[230px] sm:gap-4 sm:px-6 sm:py-8">
                    <span className="relative flex h-18 w-18 items-center justify-center rounded-full border border-cream-300 bg-white shadow-sm sm:h-20 sm:w-20">
                      <span className="absolute inset-0 rounded-full border border-gold/30 hs-ping" />
                      <LogoMark className="h-8 w-8 text-gold sm:h-9 sm:w-9" />
                    </span>
                    <div>
                      <h3 className="font-display text-[18px] font-medium text-ink sm:text-[22px]">
                        One graph
                      </h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-ink-500 sm:text-[14px]">
                        Sources collapse into one typed memory layer, so every node stays linked.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {CONNECTORS.map(({ Icon, label, note }, index) => (
                    <div
                      key={label}
                      className="group card flex items-start gap-4 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-lift sm:p-5"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cream-300 bg-white shadow-sm transition-transform duration-300 group-hover:scale-105 sm:h-12 sm:w-12">
                        <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-display text-[15px] font-medium text-ink">{label}</h3>
                          <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-400 transition-colors group-hover:text-gold">
                            0{index + 1}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
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
