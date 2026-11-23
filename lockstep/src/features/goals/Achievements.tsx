/** Achievements card + a quiet toast when a new one unlocks. */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Award, Lock } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useKv, type GoalData } from '@/db/hooks';
import { db } from '@/db/db';
import { setKv } from '@/db/repo';
import { computeAchievements } from '@/lib/achievements';
import type { GoalMetrics } from '@/lib/metrics';
import { cn } from '@/lib/cn';

export function useAchievements(data: GoalData, m: GoalMetrics) {
  const exported = useKv<string>(`exported:${data.goal.id}`);
  // `loaded` tells "not stored yet" apart from "still loading".
  const seen = useLiveQuery(
    async () => ({
      loaded: true,
      ids: (await db.kv.get(`achievements:${data.goal.id}`))?.value as string[] | undefined,
    }),
    [data.goal.id],
  );
  const list = computeAchievements(data.goal, data.milestones, data.tasks, m, { exported: !!exported });
  const unlocked = list.filter((a) => a.unlocked).map((a) => a.id);
  const key = unlocked.join(',');
  useEffect(() => {
    if (!seen?.loaded) return;
    if (seen.ids === undefined) {
      // First visit: remember what's already earned without a burst of toasts.
      void setKv(`achievements:${data.goal.id}`, unlocked);
      return;
    }
    const fresh = unlocked.filter((id) => !seen.ids!.includes(id));
    if (!fresh.length) return;
    for (const id of fresh) {
      const a = list.find((x) => x.id === id)!;
      toast(`Achievement unlocked · ${a.title}`, {
        description: a.description,
        icon: <Award className="size-4 text-gold" strokeWidth={1.5} />,
      });
    }
    void setKv(`achievements:${data.goal.id}`, [...new Set([...seen.ids, ...unlocked])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, seen]);
  return list;
}

export function AchievementsCard({ data, m }: { data: GoalData; m: GoalMetrics }) {
  const list = useAchievements(data, m);
  const count = list.filter((a) => a.unlocked).length;
  return (
    <section className="card p-5 sm:p-6" aria-labelledby={`ach-${data.goal.id}`}>
      <div className="mb-4 flex items-end justify-between">
        <h2 id={`ach-${data.goal.id}`} className="text-xl">
          Achievements
        </h2>
        <p className="font-mono text-sm tabular text-muted">
          {count}/{list.length}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {list.map((a) => (
          <li
            key={a.id}
            className={cn(
              'rounded-[14px] border p-3',
              a.unlocked ? 'border-accent/50' : 'border-dashed border-hairline',
            )}
            aria-label={`${a.title}: ${a.unlocked ? 'unlocked' : 'locked'}. ${a.description}`}
          >
            {a.unlocked ? (
              <Award className="size-5 text-accent-text" strokeWidth={1.5} aria-hidden />
            ) : (
              <Lock className="size-5 text-muted" strokeWidth={1.5} aria-hidden />
            )}
            <p className={cn('mt-2 text-sm font-medium leading-tight', !a.unlocked && 'text-muted')}>
              {a.title}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">{a.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
