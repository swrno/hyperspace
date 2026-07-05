type LogoMarkProps = {
  className?: string;
};

/** hyperspace spark — four orbiting nodes converging on a center node. */
export function LogoMark({ className = 'h-6 w-6' }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 3v8M16 21v8M3 16h8M21 16h8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="4.2" fill="currentColor" />
      <circle cx="6.2" cy="6.2" r="2.1" fill="currentColor" opacity="0.55" />
      <circle cx="25.8" cy="6.2" r="2.1" fill="currentColor" opacity="0.55" />
      <circle cx="6.2" cy="25.8" r="2.1" fill="currentColor" opacity="0.55" />
      <circle cx="25.8" cy="25.8" r="2.1" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="h-[22px] w-[22px]" />
      <span className="font-display text-[19px] font-medium tracking-[-0.02em]">hyperspace</span>
    </span>
  );
}
