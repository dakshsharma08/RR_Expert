/** Settings: appearance, time zone, reminders, Living Wallpaper links, data export/import/delete. */
import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell,
  CalendarDays,
  Database,
  Download,
  Link2,
  Moon,
  ShieldAlert,
  Sparkles,
  Upload,
  Globe2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Segmented, SwitchRow } from '@/components/ui/controls';
import { Input } from '@/components/ui/form';
import { useUi, type Mode } from '@/stores/ui';
import { db, type WallpaperRow } from '@/db/db';
import { deleteAllData, exportAll, importAll } from '@/db/repo';
import { buildIcs, downloadBlob } from '@/lib/ics';
import { getHealth } from '@/lib/api';
import { notificationsSupported, requestNotificationPermission } from './reminders';
import { deviceTimeZone, isValidTimeZone, listTimeZones } from '@shared/time';
import { revokeLivingWallpaper } from '@/features/studio/living';
import { CloudSync } from './CloudSync';
import { cloudConfigured } from '@/lib/sync/client';

export default function SettingsPage() {
  const ui = useUi();
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [revoking, setRevoking] = useState<WallpaperRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 30_000 });
  const shares = useLiveQuery(() => db.wallpapers.filter((w) => !!w.share_token).toArray(), []);
  const runs = useLiveQuery(() => db.ai_runs.toArray(), []);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const [tz, setTz] = useState(ui.defaultTimezone ?? deviceTimeZone());
  const zones = listTimeZones();

  async function exportJson() {
    const data = await exportAll();
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `lockstep-export-${new Date().toISOString().slice(0, 10)}.json`,
    );
    toast.success('Exported your data');
  }
  async function exportIcs() {
    const [g, m] = await Promise.all([
      db.goals.filter((x) => x.status === 'active' || x.status === 'completed').toArray(),
      db.milestones.toArray(),
    ]);
    if (!g.length) return toast.error('Approve a plan first. There are no dates to export yet.');
    downloadBlob(new Blob([buildIcs(g, m)], { type: 'text/calendar' }), 'lockstep-milestones.ics');
    toast.success('Calendar file downloaded', {
      description: 'Open it to add your milestones to your calendar.',
    });
  }
  async function onImport(f: File | undefined) {
    if (!f) return;
    try {
      const text = await f.text();
      const r = await importAll(JSON.parse(text));
      toast.success(`Imported ${r.goals} goal${r.goals === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error('Import failed', { description: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function wipe() {
    // Revoke any public wallpaper links first so nothing stays reachable.
    for (const s of shares ?? []) await revokeLivingWallpaper(s).catch(() => undefined);
    await deleteAllData();
    toast.success('All LOCKSTEP data deleted from this device');
    setTimeout(() => (window.location.href = '/'), 600);
  }
  async function toggleReminders(on: boolean) {
    if (on && notificationsSupported()) {
      const p = await requestNotificationPermission();
      if (p === 'denied')
        toast('Notifications are blocked', {
          description: 'You will still get in-app reminders while LOCKSTEP is open.',
        });
    }
    ui.setReminders(on);
  }

  const okRuns = (runs ?? []).filter((r) => r.ok);
  const avgLatency = okRuns.length
    ? Math.round(okRuns.reduce((s, r) => s + r.latency_ms, 0) / okRuns.length)
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-12 pt-6 sm:px-6 md:pt-10">
      <div>
        <p className="eyebrow mb-1">Preferences</p>
        <h1 className="text-[28px] sm:text-[40px]">Settings</h1>
        <p className="mt-2 text-sm text-muted">
          {cloudConfigured
            ? 'Everything is stored on this device. Sign in below only if you want to sync between devices.'
            : "You're using LOCKSTEP as a guest. Everything is stored on this device only."}
        </p>
      </div>

      <Section icon={<Moon className="size-4" />} title="Appearance">
        <Segmented<Mode>
          label="Color mode"
          value={ui.mode}
          onChange={ui.setMode}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Section>

      <Section
        icon={<Globe2 className="size-4" />}
        title="Default time zone"
        description="Used for new goals. Each goal keeps its own zone, so travelling never moves a deadline."
      >
        <div className="flex gap-2">
          <Input
            list="settings-tz"
            value={tz}
            onChange={(e) => setTz(e.target.value.trim())}
            aria-label="Default time zone"
            aria-invalid={!isValidTimeZone(tz)}
          />
          <datalist id="settings-tz">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <Button
            variant="secondary"
            onClick={() => {
              if (!isValidTimeZone(tz)) return toast.error('Pick a time zone from the list');
              ui.setDefaultTimezone(tz === deviceTimeZone() ? null : tz);
              toast.success('Default time zone saved');
            }}
          >
            Save
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">This device: {deviceTimeZone()}</p>
      </Section>

      <Section icon={<Bell className="size-4" />} title="Reminders">
        <SwitchRow
          checked={ui.remindersEnabled}
          onChange={(v) => void toggleReminders(v)}
          label="Daily reminder"
          description="A nudge about today's focus at the time below, while LOCKSTEP is open."
        />
        <div className="mt-2 flex items-center gap-3">
          <label htmlFor="rem-time" className="text-sm text-muted">
            Time
          </label>
          <Input
            id="rem-time"
            type="time"
            value={ui.reminderTime}
            onChange={(e) => ui.setReminders(ui.remindersEnabled, e.target.value || '19:00')}
            className="w-36"
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          On iPhone, notifications need LOCKSTEP added to the Home Screen (Share → Add to Home Screen).
        </p>
      </Section>

      <Section
        icon={<Link2 className="size-4" />}
        title="Living Wallpaper links"
        description="Private links that always return today's wallpaper. Revoke any link to make it stop working immediately."
      >
        {!shares?.length ? (
          <p className="text-sm text-muted">No links yet. Create one in the Studio's Export tab.</p>
        ) : (
          <ul className="space-y-2">
            {shares.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-[14px] border border-hairline p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.revoked_at ? 'Revoked' : 'Active'} · {s.device_preset}
                  </p>
                </div>
                {!s.revoked_at && (
                  <Button variant="destructive" size="sm" onClick={() => setRevoking(s)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="data" icon={<Database className="size-4" />} title="Your data">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => void exportJson()}
            icon={<Download className="size-4" strokeWidth={1.5} />}
          >
            Export JSON
          </Button>
          <Button
            variant="secondary"
            onClick={() => void exportIcs()}
            icon={<CalendarDays className="size-4" strokeWidth={1.5} />}
          >
            Export .ics
          </Button>
          <Button
            variant="ghost"
            onClick={() => fileRef.current?.click()}
            icon={<Upload className="size-4" strokeWidth={1.5} />}
          >
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
        </div>
        <p className="mt-3 text-xs text-muted">{goals?.length ?? 0} goals stored on this device.</p>
      </Section>

      <CloudSync />

      <Section icon={<Sparkles className="size-4" />} title="AI transparency">
        <p className="text-sm text-muted">
          Gemini on this server:{' '}
          <span className="text-text">
            {health.data
              ? health.data.ai.configured
                ? `connected${health.data.ai.model ? ` (${health.data.ai.model})` : ''}`
                : 'not connected'
              : health.isLoading
                ? 'checking…'
                : 'server unreachable'}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted">
          AI calls from this device: <span className="font-mono tabular text-text">{runs?.length ?? 0}</span>
          {avgLatency !== null && (
            <>
              {' '}
              · average{' '}
              <span className="font-mono tabular text-text">{(avgLatency / 1000).toFixed(1)} s</span>
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-muted">
          We log only the model, timing and token count of each call. Never your text or files. No third-party
          tracking.
        </p>
      </Section>

      <Section icon={<ShieldAlert className="size-4 text-danger" />} title="Danger zone">
        <Button variant="destructive" onClick={() => setConfirmWipe(true)}>
          Delete all data
        </Button>
        <p className="mt-2 text-xs text-muted">
          Removes every goal, plan, wallpaper and setting from this device and revokes your wallpaper links.
        </p>
      </Section>

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke this wallpaper link?"
        description="The link stops working immediately, including in any Shortcuts automation that uses it. You can create a new link later."
        confirmLabel="Revoke link"
        onConfirm={() =>
          revoking && void revokeLivingWallpaper(revoking).then(() => toast.success('Link revoked'))
        }
      />
      <ConfirmDialog
        open={confirmWipe}
        onOpenChange={setConfirmWipe}
        title="Delete all LOCKSTEP data?"
        description="This permanently removes all goals, plans, progress, wallpapers and settings from this device. Export first if you want a backup. This cannot be undone."
        confirmLabel="Delete everything"
        onConfirm={() => void wipe()}
      />
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  children,
  id,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="card p-5" aria-labelledby={`${title}-h`}>
      <h2 id={`${title}-h`} className="mb-1 flex items-center gap-2 font-sans text-base font-semibold">
        <span className="text-accent-text" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {description && <p className="mb-3 text-sm text-muted">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}
