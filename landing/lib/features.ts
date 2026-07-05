export type Feature = {
  slug: string;
  category: string;
  name: string;
  headline: string;
  description: string;
  bannerLine: string;
  variant: 'gold' | 'dusk' | 'sage';
  details: { title: string; blurb: string }[];
};

export const FEATURES: Feature[] = [
  {
    slug: 'chat',
    category: 'Product',
    name: 'Chat workspace',
    headline: 'Ask your workspace anything',
    description:
      'A chat surface wired straight into the knowledge graph. Every message triggers parallel Cognee graph lookups and vector search, fused with reciprocal rank fusion, before Groq writes a word.',
    bannerLine: 'Why did checkout latency spike last Tuesday?',
    variant: 'gold',
    details: [
      {
        title: 'Citations on every answer',
        blurb:
          'Each response lists the exact nodes it came from: the PR, the ticket, the thread. Nothing arrives without provenance.',
      },
      {
        title: 'Multi-hop when it matters',
        blurb:
          'If the first pass leaves gaps, LangGraph walks neighboring edges until the context is complete, then answers.',
      },
      {
        title: 'Memory that compounds',
        blurb:
          'Facts you share in chat become Cognee memory edges. Ask about "my project" and the graph already knows which one.',
      },
    ],
  },
  {
    slug: 'knowledge-bases',
    category: 'Product',
    name: 'Knowledge bases',
    headline: 'Your sources, under control',
    description:
      'Connect GitHub and Google Workspace, choose exactly which repos, docs, decks and channels to ingest, and watch the pipeline turn them into typed entities inside Cognee.',
    bannerLine: '12 sources syncing · last delta 14 minutes ago',
    variant: 'sage',
    details: [
      {
        title: 'Pick what gets ingested',
        blurb:
          'Repo-level and file-level selection at authorization time. The pipeline only reads what you point it at.',
      },
      {
        title: 'Queued, continuous ingestion',
        blurb:
          'A backend queue feeds Docling and pymupdf parsers, so bulk history and fresh changes flow through the same path.',
      },
      {
        title: 'Sync you can inspect',
        blurb:
          'Every knowledge base shows its last delta run, changed node counts and upsert history. No black box.',
      },
    ],
  },
  {
    slug: 'graph-studio',
    category: 'Product',
    name: 'Graph Studio',
    headline: 'Fly through the company brain',
    description:
      'A 3D, force-directed view of the entire Cognee graph. Watch communities form around services, projects and teams, and inspect any node down to its source document.',
    bannerLine: '2,847 entities · 11,203 edges · 14 communities',
    variant: 'dusk',
    details: [
      {
        title: '3D force layout',
        blurb:
          'The full graph rendered with three.js, positioned by force simulation so related work physically clusters.',
      },
      {
        title: 'Louvain community colors',
        blurb:
          'Community detection runs over the graph and colors each cluster, making team and service boundaries visible.',
      },
      {
        title: 'Provenance on click',
        blurb:
          'Select any node to see its typed edges, source platform and the exact ingestion run that created it.',
      },
    ],
  },
  {
    slug: 'mind-map',
    category: 'Product',
    name: 'Mind map',
    headline: 'See how an answer was found',
    description:
      'A 2D map of the graph built for tracing. Follow the path retrieval took, hop by hop, from the question to every node that grounded the answer.',
    bannerLine: '#incidents → PAY-212 → PR #418',
    variant: 'gold',
    details: [
      {
        title: 'ForceAtlas2 layout',
        blurb:
          'Sigma renders thousands of nodes smoothly, laid out by ForceAtlas2 so dense areas stay readable.',
      },
      {
        title: 'Hop-by-hop tracing',
        blurb:
          'Highlight the exact traversal behind any answer: which edges were followed and which nodes were fused into context.',
      },
      {
        title: 'Entity-centric views',
        blurb:
          'Center the map on a repo, an account or a person and see everything the graph connects to it.',
      },
    ],
  },
  {
    slug: 'api-keys',
    category: 'Product',
    name: 'API keys',
    headline: 'Ship the engine in your product',
    description:
      'The same ingestion and retrieval pipeline that powers hyperspace, exposed through scoped API keys and hypr-sdk. Three lines of TypeScript to a grounded answer.',
    bannerLine: 'const res = await hypr.retrieve("what shipped last sprint?")',
    variant: 'sage',
    details: [
      {
        title: 'Scoped keys',
        blurb:
          'Issue keys per environment or per integration, rotate them from the dashboard and revoke them instantly.',
      },
      {
        title: 'hypr-sdk',
        blurb:
          'Typed client for ingestion and retrieval. Point it at a knowledge base and query the graph like a function call.',
      },
      {
        title: 'Same engine, no fork',
        blurb:
          'API traffic hits the identical RRF retrieval planner and Cognee store the app uses. One engine, two doors.',
      },
    ],
  },
];

export const FEATURE_SLUGS = FEATURES.map((f) => f.slug);

export function getFeature(slug: string): Feature | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
