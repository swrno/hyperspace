import type { CSSProperties, ReactNode } from 'react';
import SpotlightCard from './SpotlightCard';

/* Soft blurred gradient blobs, one per card flavor. */
const GLOWS: Record<string, CSSProperties> = {
  gold: {
    top: '-18%',
    right: '-12%',
    width: '55%',
    height: '55%',
    background: 'radial-gradient(circle, rgba(201,166,107,0.55), transparent 70%)',
  },
  bright: {
    bottom: '-22%',
    left: '-10%',
    width: '60%',
    height: '60%',
    background: 'radial-gradient(circle, rgba(251,191,36,0.32), transparent 70%)',
  },
  cream: {
    top: '-20%',
    left: '-14%',
    width: '55%',
    height: '55%',
    background: 'radial-gradient(circle, rgba(232,213,174,0.28), transparent 70%)',
  },
  deep: {
    bottom: '-18%',
    right: '-14%',
    width: '58%',
    height: '58%',
    background: 'radial-gradient(circle, rgba(143,116,68,0.45), transparent 70%)',
  },
};

export type GlowVariant = keyof typeof GLOWS;

/**
 * Dark bento card: charcoal base, film-grain noise (.night-card), a blurred
 * gradient glow blob, and a mouse-tracking spotlight.
 */
export default function GlowCard({
  glow = 'gold',
  className = '',
  children,
}: {
  glow?: GlowVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SpotlightCard className={`night-card ${className}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full blur-3xl"
        style={GLOWS[glow]}
      />
      <div className="relative h-full">{children}</div>
    </SpotlightCard>
  );
}
