type LogoProps = { className?: string };

/* Colored marks for the infrastructure stack. Simplified geometry, official
   brand colors, sized to sit next to a wordmark. */

export function MongoLogo({ className = 'h-5 w-5' }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#13AA52"
        d="M12 2.2c1.7 3.3 4.3 5.7 4.5 9.6.2 3.5-1.6 6.5-3.7 8.1l-.3 1.9h-1l-.3-1.9c-2.1-1.6-3.9-4.6-3.7-8.1.2-3.9 2.8-6.3 4.5-9.6Z"
      />
      <path fill="#B8E5C9" d="M12 5.2v15.6l-.2.1-.3-1.9c-.1-4.3.2-9.9.5-13.8Z" />
    </svg>
  );
}

export function Neo4jLogo({ className = 'h-5 w-5' }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g stroke="#018BFF" strokeWidth="1.4">
        <line x1="10" y1="13" x2="18" y2="6" />
        <line x1="10" y1="13" x2="18" y2="19" />
      </g>
      <circle cx="9" cy="13.5" r="5" fill="#018BFF" />
      <circle cx="18.5" cy="5.5" r="2.6" fill="#0056B3" />
      <circle cx="18.5" cy="19" r="2.6" fill="#0056B3" />
    </svg>
  );
}

export function FirebaseLogo({ className = 'h-5 w-5' }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#FFA000" d="M6.2 19.2 9.5 3.6c.1-.5.8-.6 1-.1l1.9 3.7-6.2 12Z" />
      <path fill="#F57C00" d="m6.2 19.2 8.2-13c.3-.5 1-.4 1.1.2l2.3 12.4-11.6.4Z" opacity="0.85" />
      <path
        fill="#FFCA28"
        d="m6.2 19.2 10.9-5.6.7 3.9c.1.4-.1.8-.5 1l-4.6 2.6c-.4.2-.9.2-1.3 0l-5.2-1.9Z"
      />
    </svg>
  );
}

export function CogneeLogo({ className = 'h-5 w-5' }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g stroke="#1A1917" strokeWidth="1.3" opacity="0.55">
        <line x1="12" y1="12" x2="5.5" y2="7" />
        <line x1="12" y1="12" x2="18.5" y2="7" />
        <line x1="12" y1="12" x2="5.5" y2="17.5" />
        <line x1="12" y1="12" x2="18.5" y2="17.5" />
      </g>
      <circle cx="12" cy="12" r="3.4" fill="#C9A66B" />
      <circle cx="5.5" cy="7" r="1.9" fill="#1A1917" />
      <circle cx="18.5" cy="7" r="1.9" fill="#1A1917" />
      <circle cx="5.5" cy="17.5" r="1.9" fill="#1A1917" />
      <circle cx="18.5" cy="17.5" r="1.9" fill="#1A1917" />
    </svg>
  );
}

export function LangGraphLogo({ className = 'h-5 w-5' }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="3" y="8.5" width="11" height="7" rx="3.5" stroke="#1C3C3C" strokeWidth="2" />
      <rect x="10" y="8.5" width="11" height="7" rx="3.5" stroke="#2F6C6C" strokeWidth="2" />
    </svg>
  );
}

export function GroqLogo({ className = 'h-5 w-5' }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="11" r="8" fill="#F55036" />
      <path
        d="M12 7.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Zm3.8 3.8v6.6a3.3 3.3 0 0 1-3.3 3.3"
        stroke="#FFFFFF"
        strokeWidth="1.9"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
