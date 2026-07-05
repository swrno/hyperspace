import { AudioLines, Plus, SlidersHorizontal } from 'lucide-react';
import GradientArt from './GradientArt';
import { DOCS_URL, SIGNUP_URL } from '@/lib/site';
import {
  SlackColorIcon,
  DocsColorIcon,
  JiraColorIcon,
  GitHubColorIcon,
  SlidesColorIcon,
  SalesforceColorIcon,
} from './SourceIcons';

const SOURCES = [
  { label: 'Slack', Icon: SlackColorIcon },
  { label: 'Google Docs', Icon: DocsColorIcon },
  { label: 'Jira', Icon: JiraColorIcon },
  { label: 'GitHub', Icon: GitHubColorIcon },
  { label: 'Slides', Icon: SlidesColorIcon },
  { label: 'Salesforce', Icon: SalesforceColorIcon },
];

/** Glean-style chatbox: pill input with controls, brand-logo source chips below. */
function HeroChatbox() {
  return (
    <div className="w-full max-w-2xl rounded-[24px] bg-white p-5 shadow-lift sm:p-8">
      <div className="flex items-center gap-3 rounded-full border border-cream-300 bg-white py-2 pl-4 pr-2 shadow-input sm:py-2.5 sm:pl-5">
        <Plus className="h-5 w-5 shrink-0 text-ink" strokeWidth={2} />
        <p className="min-w-0 flex-1 truncate text-left text-[14px] text-ink-700 sm:text-[16px]">
          Why did checkout latency spike last Tuesday?
        </p>
        <SlidersHorizontal className="hidden h-5 w-5 shrink-0 text-ink-500 sm:block" strokeWidth={1.8} />
        <a
          href={SIGNUP_URL}
          aria-label="Ask hyperspace"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition hover:bg-ink-700"
        >
          <AudioLines className="h-5 w-5" strokeWidth={1.8} />
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {SOURCES.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-cream-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink-700 shadow-card sm:text-[13px]"
          >
            <s.Icon className="h-4 w-4" />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section id="top" className="pb-14 pt-36 sm:pb-20 sm:pt-44">
      <div className="shell">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="display-xl text-ink">
            One <span className="text-sheen">knowledge graph</span> for everything your team
            builds, ships and decides
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
            hyperspace ingests GitHub, Jira, Slack, Docs and Salesforce into a typed Cognee
            graph, traverses it with LangGraph, and answers on Groq in under a second.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href={SIGNUP_URL} className="btn-bump-gold !px-6 !py-3 !text-[15px]">
              Get started free
            </a>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-bump-accent !px-6 !py-3 !text-[15px]"
            >
              Read the docs
            </a>
          </div>
        </div>

        {/* Gradient banner with the chatbox */}
        <div className="relative mt-14 overflow-hidden rounded-3xl sm:mt-16">
          <div className="absolute inset-0">
            <GradientArt id="hero" variant="gold" />
          </div>

          <div className="relative flex min-h-[380px] items-center justify-center px-4 py-16 sm:min-h-[480px]">
            <HeroChatbox />
          </div>
        </div>
      </div>
    </section>
  );
}
