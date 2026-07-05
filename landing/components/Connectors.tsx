import { ArrowUpRight } from 'lucide-react';
import Reveal from './Reveal';
import {
  GitHubIcon,
  JiraIcon,
  SlackIcon,
  DocsIcon,
  SlidesIcon,
  SalesforceIcon,
} from './SourceIcons';

const CONNECTORS = [
  {
    Icon: GitHubIcon,
    title: 'GitHub',
    blurb: 'Repos, pull requests, commits and code review threads',
  },
  {
    Icon: JiraIcon,
    title: 'Jira',
    blurb: 'Tickets, sprints, priorities and status changes',
  },
  {
    Icon: SlackIcon,
    title: 'Slack',
    blurb: 'Channels, threads, incidents and decisions',
  },
  {
    Icon: DocsIcon,
    title: 'Google Docs',
    blurb: 'Specs, SOPs, agreements and long-form knowledge',
  },
  {
    Icon: SlidesIcon,
    title: 'Google Slides',
    blurb: 'Decks, roadmaps and slide-level structure',
  },
  {
    Icon: SalesforceIcon,
    title: 'Salesforce',
    blurb: 'Accounts, tiers, deals and customer context',
  },
];

export default function Connectors() {
  return (
    <section className="pb-20 pt-4 sm:pb-28">
      <div className="shell">
        <Reveal className="mb-8 flex items-end justify-between gap-4">
          <h2 className="display-md max-w-md text-ink">
            Built for the tools your team already lives in
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTORS.map((c, i) => (
            <Reveal key={c.title} delay={i * 60}>
              <div className="group card flex h-full items-start justify-between gap-4 p-5 transition duration-200 hover:border-cream-400">
                <div className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cream-100 text-ink">
                    <c.Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-[15px] font-medium text-ink">{c.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{c.blurb}</p>
                  </div>
                </div>
                <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-ink" />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
