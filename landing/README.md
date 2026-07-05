# hyperspace landing

Marketing site for **hyperspace.ai** — the enterprise knowledge engine powered by
Cognee, LangGraph and Groq. Next.js (App Router) + Tailwind, fully static.

## Run

```bash
npm install
npm run dev     # http://localhost:3001
npm run build   # production build
```

## Links to the rest of the monorepo

The nav's **Log in / Get Started** buttons point at the product app in [`/web`](../web)
(`{APP_URL}/login`), and **Docs** points at the VitePress site in [`/docs`](../docs).
Both are configurable in [.env.local](.env.local):

```bash
NEXT_PUBLIC_APP_URL=http://localhost:5173    # /web (Vite dev server)
NEXT_PUBLIC_DOCS_URL=http://localhost:5174   # /docs (VitePress)
```

Set these to the deployed URLs in production.

## Structure

- `app/layout.tsx` — fonts (PolySans display / Inter body, self-hosted in `public/fonts`), metadata
- `app/page.tsx` — section assembly
- `components/` — one file per section: `Hero`, `Connectors`, `Showcase`, `Pipeline`,
  `Bento`, `Story` (dark Cognee storytelling band), `Faq`, `FinalCta`, `Included`, `Footer`
- `lib/site.ts` — all outbound URLs in one place
