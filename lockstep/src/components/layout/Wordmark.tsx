import { cn } from '@/lib/cn';

/** LOCKSTEP wordmark: a small gold ring "lock" + spaced serif caps. */
export function Wordmark({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="shrink-0">
        <circle cx="13" cy="13" r="11" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
        <circle
          cx="13"
          cy="13"
          r="11"
          fill="none"
          stroke="var(--gold-light)"
          strokeWidth="1.5"
          strokeDasharray="69.1"
          strokeDashoffset="48"
          strokeLinecap="round"
          transform="rotate(-90 13 13)"
        />
        <rect x="11.5" y="8" width="3" height="10" rx="1.5" fill="var(--gold)" />
      </svg>
      {!compact && (
        <span className="font-display text-[17px] font-medium tracking-[0.22em] text-text">LOCKSTEP</span>
      )}
    </span>
  );
}
