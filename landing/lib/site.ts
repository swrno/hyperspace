/**
 * Central place for outbound links. The landing site is a separate Next.js
 * app; the product (login/dashboard) lives in /web (Vite, port 5173) and the
 * docs are a VitePress site in /docs. Override per environment via
 * NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_DOCS_URL.
 */
// Empty origin = same-origin links (production: Caddy serves the app under
// /login, /app, ... and the docs under /docs on the same host).
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? '';

export const APP_URL = APP_ORIGIN || '/app';

export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? '/docs';

export const LOGIN_URL =
  process.env.NEXT_PUBLIC_LOGIN_URL ?? `${APP_ORIGIN}/login`;
export const SIGNUP_URL = LOGIN_URL;

export const GITHUB_URL = 'https://github.com/swrno/hyperspace';

export const NAV_LINKS = [
  { label: 'Product', href: '/#product' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Inside the engine', href: '/#engine' },
  { label: 'FAQ', href: '/#faq' },
];
