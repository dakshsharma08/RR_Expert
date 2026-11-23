/**
 * Always-open, draggable bottom sheet (non-modal). Drag the handle (or tap / press
 * Enter on it) to switch between "peek" and "expanded". Unlike a modal drawer, the
 * page behind stays fully usable and visible to screen readers.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function BottomSheet({
  expanded,
  onExpandedChange,
  peek = 0.42,
  full = 0.9,
  label,
  children,
  className,
}: {
  expanded: boolean;
  onExpandedChange: (e: boolean) => void;
  peek?: number;
  full?: number;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; base: number } | null>(null);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const fullH = vh * full;
  const restOffset = expanded ? 0 : fullH - vh * peek;
  const offset = drag ?? restOffset;

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    start.current = { y: e.clientY, base: restOffset };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const next = Math.min(fullH - vh * 0.18, Math.max(0, start.current.base + (e.clientY - start.current.y)));
    setDrag(next);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const moved = Math.abs(e.clientY - start.current.y);
    const current = drag ?? restOffset;
    start.current = null;
    setDrag(null);
    if (moved < 6)
      onExpandedChange(!expanded); // a tap toggles
    else onExpandedChange(current < (fullH - vh * peek) / 2);
  };

  return (
    <section
      aria-label={label}
      className={cn(
        'fixed inset-x-0 bottom-0 z-[35] flex flex-col rounded-t-[24px] border-t border-line-strong bg-surface shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)]',
        drag === null && 'transition-transform duration-300 ease-out',
        className,
      )}
      style={{ height: fullH, transform: `translateY(${offset}px)` }}
    >
      <button
        type="button"
        aria-label={expanded ? 'Collapse controls' : 'Expand controls'}
        aria-expanded={expanded}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onExpandedChange(!expanded);
          }
        }}
        onClick={(e) => e.detail === 0 && onExpandedChange(!expanded)}
        className="flex h-8 w-full shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
      >
        <span className="h-1.5 w-12 rounded-full bg-line-strong" aria-hidden />
      </button>
      {children}
    </section>
  );
}
