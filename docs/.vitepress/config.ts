import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'hypr',
  description: 'Enterprise knowledge engine — Knowledge Base (GraphRAG on Neo4j), personalization Memory (Cognee), and the hyper-sdk client.',
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API', link: '/api/chat' },
      { text: 'hyper-sdk', link: '/sdk/getting-started' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is hypr?', link: '/guide/introduction' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
        {
          text: 'Core concepts',
          items: [
            { text: 'Knowledge Base (Neo4j)', link: '/guide/knowledge-base' },
            { text: 'Memory (Cognee)', link: '/guide/memory' },
            { text: 'Search modes', link: '/guide/search-modes' },
            { text: 'Applications', link: '/guide/applications' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Owner-facing API',
          items: [
            { text: 'POST /api/chat', link: '/api/chat' },
            { text: 'POST /api/app-chat', link: '/api/app-chat' },
            { text: 'GET /api/stats', link: '/api/stats' },
            { text: 'GET /api/app-users', link: '/api/app-users' },
          ],
        },
        {
          text: 'Public SDK API',
          items: [
            { text: 'POST /api/sdk/query', link: '/api/sdk-query' },
            { text: 'POST /api/sdk/ingest', link: '/api/sdk-ingest' },
          ],
        },
      ],
      '/sdk/': [
        {
          text: 'hyper-sdk',
          items: [
            { text: 'Getting started', link: '/sdk/getting-started' },
            { text: 'API reference', link: '/sdk/api-reference' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/swrno/hyperspace' },
    ],

    search: {
      provider: 'local',
    },
  },
});
