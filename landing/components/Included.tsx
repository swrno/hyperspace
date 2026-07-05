import Reveal from './Reveal';
import { APP_URL, DOCS_URL } from '@/lib/site';

const GROUPS: { title: string; items: { label: string; href: string }[] }[] = [
  {
    title: 'In the app',
    items: [
      { label: 'Chat workspace', href: APP_URL },
      { label: 'Knowledge bases', href: APP_URL },
      { label: '3D Graph Studio', href: APP_URL },
      { label: 'Mind map', href: APP_URL },
    ],
  },
  {
    title: 'For builders',
    items: [
      { label: 'API keys', href: APP_URL },
      { label: 'hypr SDK', href: `${DOCS_URL}/sdk/` },
      { label: 'API reference', href: `${DOCS_URL}/api/` },
      { label: 'Getting started', href: `${DOCS_URL}/guide/` },
    ],
  },
  {
    title: 'Under the hood',
    items: [
      { label: 'Cognee GraphRAG', href: `${DOCS_URL}` },
      { label: 'LangGraph retrieval', href: `${DOCS_URL}` },
      { label: 'Groq inference', href: `${DOCS_URL}` },
      { label: 'Continuous ingestion', href: `${DOCS_URL}` },
    ],
  },
];

export default function Included() {
  return (
    <section className="border-t border-cream-200 bg-cream-100/60 py-14 sm:py-16">
      <div className="shell">
        <Reveal>
          <p className="font-display text-sm font-medium text-ink-400">What&rsquo;s included</p>
        </Reveal>
        <div className="mt-6 grid gap-8 sm:grid-cols-3">
          {GROUPS.map((group, gi) => (
            <Reveal key={group.title} delay={gi * 60}>
              <h3 className="font-display text-sm font-medium text-ink">{group.title}</h3>
              <ul className="mt-3 space-y-2">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13.5px] text-ink-500 underline decoration-cream-400 underline-offset-4 transition hover:text-ink hover:decoration-ink"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
