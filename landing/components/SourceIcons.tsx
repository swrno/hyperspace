type IconProps = {
  className?: string;
};

/**
 * Minimal monochrome glyphs for the workspace tools hyperspace ingests.
 * Deliberately geometric/neutral (not official brand assets) so they sit
 * quietly inside the cream design system.
 */

export function GitHubIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 1.8a10.2 10.2 0 0 0-3.22 19.88c.51.1.7-.22.7-.49l-.01-1.73c-2.84.62-3.44-1.37-3.44-1.37-.46-1.18-1.13-1.5-1.13-1.5-.93-.63.07-.62.07-.62 1.03.07 1.57 1.05 1.57 1.05.91 1.57 2.39 1.12 2.97.85.09-.66.36-1.11.65-1.37-2.27-.26-4.65-1.13-4.65-5.04 0-1.11.4-2.02 1.05-2.74-.11-.26-.46-1.3.1-2.7 0 0 .86-.28 2.8 1.05a9.72 9.72 0 0 1 5.1 0c1.94-1.33 2.8-1.05 2.8-1.05.56 1.4.21 2.44.1 2.7.65.72 1.05 1.63 1.05 2.74 0 3.92-2.39 4.78-4.66 5.03.37.32.69.94.69 1.9l-.01 2.8c0 .27.19.6.7.49A10.2 10.2 0 0 0 12 1.8Z" />
    </svg>
  );
}

export function JiraIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2 6.5 7.5a3.9 3.9 0 0 0 0 5.5l2.75 2.75L12 13l-2.75-2.75L12 7.5l2.75 2.75L12 13l2.75 2.75L17.5 13a3.9 3.9 0 0 0 0-5.5L12 2Z" opacity="0.9" />
      <path d="m9.25 15.75 2.75 2.75 2.75-2.75L12 13l-2.75 2.75Z" opacity="0.55" />
      <path d="M12 18.5 9.25 21.25 12 24l2.75-2.75L12 18.5Z" opacity="0.3" />
    </svg>
  );
}

export function SlackIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9.1 2.5a1.9 1.9 0 0 0 0 3.8h1.9V4.4a1.9 1.9 0 0 0-1.9-1.9Zm0 5H4.4a1.9 1.9 0 0 0 0 3.8h4.7a1.9 1.9 0 0 0 0-3.8Z" opacity="0.85" />
      <path d="M21.5 9.4a1.9 1.9 0 0 0-3.8 0v1.9h1.9a1.9 1.9 0 0 0 1.9-1.9Zm-5 0V4.7a1.9 1.9 0 0 0-3.8 0v4.7a1.9 1.9 0 0 0 3.8 0Z" opacity="0.6" />
      <path d="M14.9 21.5a1.9 1.9 0 0 0 0-3.8H13v1.9a1.9 1.9 0 0 0 1.9 1.9Zm0-5h4.7a1.9 1.9 0 0 0 0-3.8h-4.7a1.9 1.9 0 0 0 0 3.8Z" opacity="0.85" />
      <path d="M2.5 14.6a1.9 1.9 0 0 0 3.8 0v-1.9H4.4a1.9 1.9 0 0 0-1.9 1.9Zm5 0v4.7a1.9 1.9 0 0 0 3.8 0v-4.7a1.9 1.9 0 0 0-3.8 0Z" opacity="0.6" />
    </svg>
  );
}

export function DocsIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6 2.5A1.5 1.5 0 0 0 4.5 4v16A1.5 1.5 0 0 0 6 21.5h12a1.5 1.5 0 0 0 1.5-1.5V8.6a1.5 1.5 0 0 0-.44-1.06l-4.6-4.6a1.5 1.5 0 0 0-1.06-.44H6Z" opacity="0.9" />
      <path d="M8 12h8v1.6H8V12Zm0 3.4h8V17H8v-1.6Zm0-6.8h4.5v1.6H8V8.6Z" fill="#FCFAF6" />
    </svg>
  );
}

export function SlidesIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6 2.5A1.5 1.5 0 0 0 4.5 4v16A1.5 1.5 0 0 0 6 21.5h12a1.5 1.5 0 0 0 1.5-1.5V8.6a1.5 1.5 0 0 0-.44-1.06l-4.6-4.6a1.5 1.5 0 0 0-1.06-.44H6Z" opacity="0.9" />
      <rect x="7.5" y="10" width="9" height="6.5" rx="0.8" fill="#FCFAF6" />
      <rect x="9" y="11.5" width="6" height="3.5" rx="0.4" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function SalesforceIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10.1 6.2a4 4 0 0 1 3.1-1.5c1.4 0 2.7.8 3.4 1.9a3.6 3.6 0 0 1 1.5-.3 3.8 3.8 0 0 1 0 7.6c-.3 0-.6 0-.9-.1a3.4 3.4 0 0 1-4.5 1.4 3.9 3.9 0 0 1-3.5 2.2 3.9 3.9 0 0 1-3.6-2.5 3.5 3.5 0 0 1-4.1-3.5 3.6 3.6 0 0 1 3.6-3.6c.3 0 .7 0 1 .1a4 4 0 0 1 4-1.7Z" />
    </svg>
  );
}

export function ConfluenceIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 17.6c2.6-4.2 5.4-5 10-2.9l5.6 2.6-1.7 3.8-5.7-2.6c-2.8-1.3-3.9-1-5.4 1.5L3 17.6Z" opacity="0.9" />
      <path d="M21 6.4c-2.6 4.2-5.4 5-10 2.9L5.4 6.7l1.7-3.8 5.7 2.6c2.8 1.3 3.9 1 5.4-1.5L21 6.4Z" opacity="0.55" />
    </svg>
  );
}

/* ── Full-color brand marks (official brand colors, simplified geometry) ── */

export function SlackColorIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#36C5F0"
        d="M9.1 2.5a1.9 1.9 0 0 0 0 3.8h1.9V4.4a1.9 1.9 0 0 0-1.9-1.9Zm0 5H4.4a1.9 1.9 0 0 0 0 3.8h4.7a1.9 1.9 0 0 0 0-3.8Z"
      />
      <path
        fill="#2EB67D"
        d="M21.5 9.4a1.9 1.9 0 0 0-3.8 0v1.9h1.9a1.9 1.9 0 0 0 1.9-1.9Zm-5 0V4.7a1.9 1.9 0 0 0-3.8 0v4.7a1.9 1.9 0 0 0 3.8 0Z"
      />
      <path
        fill="#ECB22E"
        d="M14.9 21.5a1.9 1.9 0 0 0 0-3.8H13v1.9a1.9 1.9 0 0 0 1.9 1.9Zm0-5h4.7a1.9 1.9 0 0 0 0-3.8h-4.7a1.9 1.9 0 0 0 0 3.8Z"
      />
      <path
        fill="#E01E5A"
        d="M2.5 14.6a1.9 1.9 0 0 0 3.8 0v-1.9H4.4a1.9 1.9 0 0 0-1.9 1.9Zm5 0v4.7a1.9 1.9 0 0 0 3.8 0v-4.7a1.9 1.9 0 0 0-3.8 0Z"
      />
    </svg>
  );
}

export function GitHubColorIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#181717"
        d="M12 1.8a10.2 10.2 0 0 0-3.22 19.88c.51.1.7-.22.7-.49l-.01-1.73c-2.84.62-3.44-1.37-3.44-1.37-.46-1.18-1.13-1.5-1.13-1.5-.93-.63.07-.62.07-.62 1.03.07 1.57 1.05 1.57 1.05.91 1.57 2.39 1.12 2.97.85.09-.66.36-1.11.65-1.37-2.27-.26-4.65-1.13-4.65-5.04 0-1.11.4-2.02 1.05-2.74-.11-.26-.46-1.3.1-2.7 0 0 .86-.28 2.8 1.05a9.72 9.72 0 0 1 5.1 0c1.94-1.33 2.8-1.05 2.8-1.05.56 1.4.21 2.44.1 2.7.65.72 1.05 1.63 1.05 2.74 0 3.92-2.39 4.78-4.66 5.03.37.32.69.94.69 1.9l-.01 2.8c0 .27.19.6.7.49A10.2 10.2 0 0 0 12 1.8Z"
      />
    </svg>
  );
}

export function JiraColorIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#2684FF"
        d="M12 2 6.5 7.5a3.9 3.9 0 0 0 0 5.5l2.75 2.75L12 13l-2.75-2.75L12 7.5l2.75 2.75L12 13l2.75 2.75L17.5 13a3.9 3.9 0 0 0 0-5.5L12 2Z"
      />
      <path fill="#0052CC" d="m9.25 15.75 2.75 2.75 2.75-2.75L12 13l-2.75 2.75Z" />
      <path fill="#0052CC" opacity="0.6" d="M12 18.5 9.25 21.25 12 24l2.75-2.75L12 18.5Z" />
    </svg>
  );
}

export function DocsColorIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M6 2.5A1.5 1.5 0 0 0 4.5 4v16A1.5 1.5 0 0 0 6 21.5h12a1.5 1.5 0 0 0 1.5-1.5V8.6a1.5 1.5 0 0 0-.44-1.06l-4.6-4.6a1.5 1.5 0 0 0-1.06-.44H6Z"
      />
      <path fill="#A1C2FA" d="M13.4 2.6v4.5a1 1 0 0 0 1 1h4.5l-5.5-5.5Z" />
      <path fill="#FFFFFF" d="M8 12h8v1.6H8V12Zm0 3.4h8V17H8v-1.6Zm0-6.8h4.5v1.6H8V8.6Z" />
    </svg>
  );
}

export function SlidesColorIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#F4B400"
        d="M6 2.5A1.5 1.5 0 0 0 4.5 4v16A1.5 1.5 0 0 0 6 21.5h12a1.5 1.5 0 0 0 1.5-1.5V8.6a1.5 1.5 0 0 0-.44-1.06l-4.6-4.6a1.5 1.5 0 0 0-1.06-.44H6Z"
      />
      <path fill="#FADB80" d="M13.4 2.6v4.5a1 1 0 0 0 1 1h4.5l-5.5-5.5Z" />
      <rect x="7.5" y="10" width="9" height="6.5" rx="0.8" fill="#FFFFFF" />
      <rect x="9" y="11.5" width="6" height="3.5" rx="0.4" fill="#F4B400" />
    </svg>
  );
}

export function SalesforceColorIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#00A1E0"
        d="M10.1 6.2a4 4 0 0 1 3.1-1.5c1.4 0 2.7.8 3.4 1.9a3.6 3.6 0 0 1 1.5-.3 3.8 3.8 0 0 1 0 7.6c-.3 0-.6 0-.9-.1a3.4 3.4 0 0 1-4.5 1.4 3.9 3.9 0 0 1-3.5 2.2 3.9 3.9 0 0 1-3.6-2.5 3.5 3.5 0 0 1-4.1-3.5 3.6 3.6 0 0 1 3.6-3.6c.3 0 .7 0 1 .1a4 4 0 0 1 4-1.7Z"
      />
    </svg>
  );
}

export const SOURCE_ICON_MAP = {
  github: GitHubIcon,
  jira: JiraIcon,
  slack: SlackIcon,
  docs: DocsIcon,
  slides: SlidesIcon,
  salesforce: SalesforceIcon,
} as const;

export type SourceKey = keyof typeof SOURCE_ICON_MAP;
