import { Wordmark } from './LogoMark';
import { APP_URL, DOCS_URL, GITHUB_URL, LOGIN_URL } from '@/lib/site';

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Chat workspace', href: '/features/chat' },
      { label: 'Knowledge bases', href: '/features/knowledge-bases' },
      { label: 'Graph Studio', href: '/features/graph-studio' },
      { label: 'Mind map', href: '/features/mind-map' },
      { label: 'API keys', href: '/features/api-keys' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Documentation', href: DOCS_URL, external: true },
      { label: 'Getting started', href: `${DOCS_URL}/guide/`, external: true },
      { label: 'API reference', href: `${DOCS_URL}/api/`, external: true },
      { label: 'hypr SDK', href: `${DOCS_URL}/sdk/`, external: true },
      { label: 'GitHub', href: GITHUB_URL, external: true },
    ],
  },
  {
    title: 'Engine',
    links: [
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Inside the engine', href: '/#engine' },
      { label: 'Connectors', href: '/#product' },
      { label: 'FAQ', href: '/#faq' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Log in', href: LOGIN_URL, external: true },
      { label: 'Get started', href: LOGIN_URL, external: true },
      { label: 'Open the app', href: APP_URL, external: true },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="overflow-hidden border-t border-cream-200 bg-white">
      <div className="shell pt-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Wordmark className="text-ink" />
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-ink-400">
              The enterprise knowledge engine. One typed graph across GitHub, Jira, Slack, Docs
              and more, powered by Cognee, LangGraph and Groq.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="text-[13px] font-semibold text-ink">{col.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                        className="text-[13.5px] text-ink-400 transition hover:text-ink"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-cream-200 pt-6 sm:flex-row sm:items-center">
          <p className="text-[12.5px] text-ink-400">
            © {new Date().getFullYear()} hyperspace · Built at the WeMakeDevs hackathon
          </p>
        </div>
      </div>

      {/* Giant watermark wordmark, fading into the page edge */}
      <div aria-hidden="true" className="pointer-events-none select-none">
        <p
          className="-mb-[0.23em] whitespace-nowrap text-center font-display font-medium leading-none tracking-[-0.045em]"
          style={{
            fontSize: 'clamp(88px, 17vw, 300px)',
            background: 'linear-gradient(180deg, rgba(26,25,23,0.11) 0%, rgba(26,25,23,0.015) 90%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          hyperspace
        </p>
      </div>
    </footer>
  );
}
