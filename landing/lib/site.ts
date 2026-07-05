/**
 * Central place for outbound links. The landing site is a separate Next.js
 * app; the product (login/dashboard) lives in /web (Vite, port 5173) and the
 * docs are a VitePress site in /docs. Override per environment via
 * NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_DOCS_URL.
 */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

export const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:5174';

export const LOGIN_URL = `${APP_URL}/login`;
export const SIGNUP_URL = `${APP_URL}/login`;

export const GITHUB_URL = 'https://github.com/soumyadipdotexe';

export const NAV_LINKS = [
  { label: 'Product', href: '/#product' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Inside the engine', href: '/#engine' },
  { label: 'FAQ', href: '/#faq' },
];
