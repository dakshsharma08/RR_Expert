/**
 * Phone mockup cycling through wallpaper templates. These are clearly labelled
 * EXAMPLES drawn by the real renderer with sample numbers. They're not AI output.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PhonePreview } from '@/features/studio/PhonePreview';
import { defaultDesign, getTemplate } from '@shared/wallpaper/templates';
import type { TemplateId, WallpaperData } from '@shared/wallpaper/types';

const CYCLE: TemplateId[] = ['monolith', 'orbit', 'ledger', 'constellation', 'aurora', 'ivory-paper'];

const EXAMPLE: WallpaperData = {
  goalTitle: 'Example: Launch portfolio site',
  daysLeft: 18,
  state: 'active',
  dayNumber: 12,
  totalDays: 30,
  deadlineLabel: 'Fri 18 Dec',
  nextMilestone: { title: 'Write case study #2', dateLabel: 'Tue 8 Dec' },
  progressPct: 0.42,
  motivation: 'Two case studies to go. Keep the streak.',
  updatedLabel: 'Example wallpaper',
  milestones: [
    { title: 'Wireframes', at: 0.15, done: true },
    { title: 'Case study 1', at: 0.35, done: true },
    { title: 'Case study 2', at: 0.55, done: false },
    { title: 'Case study 3', at: 0.75, done: false },
    { title: 'Launch', at: 1, done: false },
  ],
};

export function LandingPhones() {
  const [i, setI] = useState(0);
  const [w, setW] = useState(250);
  // Draw the phone only after the page is idle: the headline paints first (better LCP/TBT).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const ric = (
      window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    ).requestIdleCallback;
    if (ric) ric(() => setReady(true), { timeout: 1500 });
    else setTimeout(() => setReady(true), 600);
  }, []);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setW(window.innerWidth < 400 ? 210 : 260);
    if (reduced) return;
    const id = setInterval(() => setI((x) => (x + 1) % CYCLE.length), 3200);
    return () => clearInterval(id);
  }, []);
  const t = CYCLE[i]!;
  return (
    <div className="relative mx-auto flex flex-col items-center">
      {!ready ? (
        <div
          className="rounded-[40px] border border-line-strong bg-[#050505]"
          style={{ width: w + 16, height: Math.round(w * 2.174) + 16 }}
          aria-hidden
        />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={t}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.35 }}
          >
            <PhonePreview
              design={defaultDesign(t, undefined, 'iphone-pro')}
              data={EXAMPLE}
              width={w}
              showUi
              widgets={false}
              label={`Example lock screen, ${t} template`}
            />
          </motion.div>
        </AnimatePresence>
      )}
      <p className="mt-4 text-xs text-muted" aria-live="off">
        Example wallpaper · {getTemplate(t).label} template · 8 templates in the Studio
      </p>
    </div>
  );
}
