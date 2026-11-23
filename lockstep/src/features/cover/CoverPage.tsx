/**
 * Hidden /cover route: the 3:2 submission preview image (captured by Playwright at
 * 2400×1600). It renders the ACTIVE goal's real data in three templates. No personal
 * info, only the goal title and its numbers.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useActiveGoalId, useGoalData } from '@/db/hooks';
import { useMinuteMetrics, useMotivation } from '@/features/goals/components';
import { PhonePreview } from '@/features/studio/PhonePreview';
import { buildWallpaperData } from '@/features/studio/wallpaperData';
import { Wordmark } from '@/components/layout/Wordmark';
import { defaultDesign } from '@shared/wallpaper/templates';
import type { TemplateId, ThemeId } from '@shared/wallpaper/types';

const PHONES: { t: TemplateId; theme?: ThemeId }[] = [
  { t: 'orbit' },
  { t: 'monolith' },
  { t: 'ledger', theme: 'ivory' },
];

export default function CoverPage() {
  const [params] = useSearchParams();
  const activeId = useActiveGoalId();
  const data = useGoalData(activeId ?? undefined);
  const m = useMinuteMetrics(data);
  const motivation = useMotivation(data?.goal, m);
  const wp = useMemo(
    () => (data && m ? buildWallpaperData(data, m, motivation.line, Date.now()) : null),
    [data, m, motivation.line],
  );
  const url = params.get('url') ?? import.meta.env.VITE_PUBLIC_APP_URL ?? '';
  const templates = (params.get('t')?.split(',') as TemplateId[] | undefined) ?? null;
  const phones = templates ? templates.map((t) => ({ t, theme: undefined as ThemeId | undefined })) : PHONES;

  return (
    <div
      className="relative flex h-[1600px] w-[2400px] items-center justify-center overflow-hidden bg-[#090909] text-[#E8DFC9]"
      data-mode="dark"
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[1500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(197,161,90,0.14)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(197,161,90,0.10)]" />
      <div className="relative flex w-[1960px] items-center justify-between">
        <div className="w-[760px]">
          <Wordmark className="scale-[2.2] origin-left" />
          <h1 className="mt-20 font-display text-[124px] font-light leading-[1.02] tracking-[-0.02em]">
            Your deadline,
            <br />
            <span className="italic text-[#E5CC91]">locked in.</span>
          </h1>
          <p className="mt-10 max-w-[680px] text-[32px] leading-snug text-[#9A9A9A]">
            Gemini-planned milestones, a live countdown and a lock screen that shows real progress.
          </p>
          <p className="mt-14 inline-flex items-center gap-3 rounded-full border border-[rgba(197,161,90,0.4)] px-7 py-3 text-[26px] text-[#E5CC91]">
            ✦ Built with Google Gemini
          </p>
          {url && <p className="mt-8 font-mono text-[22px] text-[#9A9A9A]">{url}</p>}
        </div>
        <div className="flex items-center gap-10" data-ready={wp ? 'true' : 'false'} id="cover-phones">
          {wp ? (
            phones.map((p, i) => (
              <div key={p.t} style={{ transform: `translateY(${i === 1 ? -40 : 40}px)` }}>
                <PhonePreview
                  design={defaultDesign(p.t, p.theme, 'iphone-pro')}
                  data={wp}
                  width={i === 1 ? 380 : 340}
                  showUi
                  widgets={false}
                />
              </div>
            ))
          ) : (
            <p className="w-[1100px] text-center text-3xl text-[#9A9A9A]">
              Create and approve a goal to render the cover.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
