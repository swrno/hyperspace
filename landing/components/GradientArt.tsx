type GradientArtProps = {
  /** Palette variant. */
  variant?: 'gold' | 'dusk' | 'sage';
  className?: string;
  /** Unique id suffix so multiple instances don't collide on filter ids. */
  id: string;
};

const PALETTES: Record<NonNullable<GradientArtProps['variant']>, string[]> = {
  // Product gold — warm amber marble with deep ink veins
  gold: ['#E8D5AE', '#C9A66B', '#FBBF24', '#8F7444', '#F7F3EA', '#33302E'],
  // Warm dusk — gold into deep charcoal and ember
  dusk: ['#33302E', '#C9A66B', '#8F7444', '#1A1917', '#E8D5AE', '#FBBF24'],
  // Quiet sage-gold — muted supporting art
  sage: ['#EFEBE3', '#D6C8A4', '#C9A66B', '#A8A18F', '#F7F3EA', '#6B6762'],
};

/**
 * Fluid-marble gradient art, generated entirely in SVG (feTurbulence +
 * displacement over soft ellipses). Serves as the colorful "photography"
 * layer of the page without shipping any image assets.
 */
export default function GradientArt({ variant = 'gold', className = '', id }: GradientArtProps) {
  const [c0, c1, c2, c3, c4, c5] = PALETTES[variant];
  const fid = `marble-${id}`;

  return (
    <svg
      viewBox="0 0 800 440"
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full ${className}`}
      aria-hidden="true"
    >
      <defs>
        <filter id={fid} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.0035 0.007"
            numOctaves="2"
            seed="11"
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="140" />
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <linearGradient id={`${fid}-base`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c0} />
          <stop offset="55%" stopColor={c1} />
          <stop offset="100%" stopColor={c3} />
        </linearGradient>
      </defs>

      <rect width="800" height="440" fill={`url(#${fid}-base)`} />
      <g filter={`url(#${fid})`}>
        <ellipse cx="180" cy="120" rx="320" ry="170" fill={c4} opacity="0.9" />
        <ellipse cx="620" cy="90" rx="280" ry="150" fill={c2} opacity="0.75" />
        <ellipse cx="700" cy="360" rx="300" ry="160" fill={c3} opacity="0.85" />
        <ellipse cx="330" cy="400" rx="360" ry="150" fill={c1} opacity="0.9" />
        <ellipse cx="90" cy="330" rx="200" ry="120" fill={c5} opacity="0.55" />
        <ellipse cx="480" cy="220" rx="220" ry="90" fill={c4} opacity="0.6" />
      </g>
    </svg>
  );
}
