import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const polySans = localFont({
  src: [
    { path: '../public/fonts/PolySans-Slim.woff2', weight: '300', style: 'normal' },
    { path: '../public/fonts/PolySans-Neutral.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/PolySans-Median.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-polysans',
  display: 'swap',
});

const polyMono = localFont({
  src: [{ path: '../public/fonts/PolySans-NeutralMono.woff2', weight: '400', style: 'normal' }],
  variable: '--font-polymono',
  display: 'swap',
});

const inter = localFont({
  src: [
    { path: '../public/fonts/Inter-Regular.f1f0c35b32.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/Inter-SemiBold.fcb100c760.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'hyperspace | The knowledge engine for your entire workspace',
  description:
    'hyperspace ingests GitHub, Jira, Slack, Google Docs and Salesforce into one typed knowledge graph. Ask anything, get answers with citations. Powered by Cognee, LangGraph and Groq.',
  keywords: [
    'hyperspace',
    'hypr',
    'knowledge graph',
    'GraphRAG',
    'Cognee',
    'LangGraph',
    'enterprise search',
    'workspace AI',
  ],
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'hyperspace | The knowledge engine for your entire workspace',
    description:
      'Turn fragmented workspace tools into one typed knowledge graph. Ask anything, get answers with citations.',
    siteName: 'hyperspace',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${polySans.variable} ${polyMono.variable} ${inter.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
