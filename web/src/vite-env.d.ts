/// <reference types="vite/client" />

// Typed environment variables. Vite exposes any `VITE_`-prefixed var on
// `import.meta.env`; declaring them here gives autocomplete + type-checking.
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  readonly VITE_DOCS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Allow side-effect CSS imports (e.g. highlight.js themes, sigma styles).
declare module '*.css';

// react-force-graph-3d ships loose/partial types; treat as any so the lazy
// import and its node/link render callbacks type-check cleanly.
declare module 'react-force-graph-3d';
