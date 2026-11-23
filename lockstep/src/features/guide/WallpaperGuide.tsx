/**
 * Step-by-step "set as wallpaper" guide for iPhone and Android, plus the Living
 * Wallpaper automation. Honest by design: a website cannot change your lock screen
 * itself — you do it once, and LOCKSTEP keeps the picture up to date.
 */
import * as Tabs from '@radix-ui/react-tabs';
import { Apple, Smartphone, RefreshCw, Info } from 'lucide-react';

const IOS = [
  {
    t: 'Save the image',
    d: 'Tap Export, then "Share / Save Image" and pick "Save Image". It lands in Photos at full resolution.',
  },
  {
    t: 'Open it as a wallpaper',
    d: 'In Photos, open the image, tap Share (□↑) and choose "Use as Wallpaper". Or go to Settings → Wallpaper → Add New Wallpaper → Photos.',
  },
  {
    t: 'Keep it sharp',
    d: "Don't pinch or zoom. The image is already the exact size of your screen. Turn off Depth Effect so the clock never covers your numbers.",
  },
  { t: 'Add', d: 'Tap Add, then "Set as Wallpaper Pair" (or customise the Home Screen separately).' },
  {
    t: 'Refresh weekly',
    d: 'After progress, open Studio and tap "Refresh with today\'s progress", then repeat steps 1–4. Or automate it with a Living Wallpaper link (next tab).',
  },
];

const ANDROID = [
  { t: 'Download the image', d: 'Tap Export, then Download (or Share → Save to Photos/Gallery).' },
  {
    t: 'Pixel',
    d: 'Long-press the Home Screen → Wallpaper & style → More wallpapers → My photos → pick the image → Set wallpaper → Lock screen.',
  },
  { t: 'Samsung Galaxy', d: 'Open the image in Gallery → ⋮ → Set as wallpaper → Lock screen → Done.' },
  { t: 'Other phones', d: 'Settings → Wallpaper → choose from Photos/Gallery → apply to Lock screen.' },
  {
    t: 'Refresh',
    d: 'Android has no built-in daily automation for wallpapers, so refresh by hand: open Studio → "Refresh with today\'s progress" → Export → set it again (about 20 seconds).',
  },
];

const LIVING = [
  {
    t: 'Create your private link',
    d: 'Studio → Export → "Create Living Wallpaper link". The link has no personal data in it, and you can revoke it in Settings at any time.',
  },
  {
    t: 'Open Shortcuts → Automation',
    d: 'Tap + → "Time of Day". Choose a time before you wake up (e.g. 6:00, Daily), then select "Run Immediately".',
  },
  { t: 'Add "Get Contents of URL"', d: 'Paste your Living Wallpaper link as the URL.' },
  {
    t: 'Add "Set Wallpaper"',
    d: 'Choose your Lock Screen wallpaper, use the output of the previous step as the image, and turn off "Show Preview" and "Crop to Subject".',
  },
  {
    t: 'Done',
    d: "Every morning your iPhone fetches today's wallpaper with the real days left and progress. You set this up once; LOCKSTEP never touches your phone settings.",
  },
];

export function WallpaperGuide({ defaultTab = 'ios' }: { defaultTab?: 'ios' | 'android' | 'living' }) {
  return (
    <div>
      <p className="mb-4 flex gap-2 rounded-[14px] border border-hairline p-3 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-accent-text" strokeWidth={1.5} aria-hidden />
        Phones don't let websites change the lock screen, so you set the wallpaper yourself. It takes under a
        minute.
      </p>
      <Tabs.Root defaultValue={defaultTab}>
        <Tabs.List
          aria-label="Phone type"
          className="mb-5 grid grid-cols-3 gap-1 rounded-[14px] border border-hairline bg-surface-2/60 p-1"
        >
          <Tab value="ios" icon={<Apple className="size-4" strokeWidth={1.5} />}>
            iPhone
          </Tab>
          <Tab value="android" icon={<Smartphone className="size-4" strokeWidth={1.5} />}>
            Android
          </Tab>
          <Tab value="living" icon={<RefreshCw className="size-4" strokeWidth={1.5} />}>
            Auto-refresh
          </Tab>
        </Tabs.List>
        <Tabs.Content value="ios">
          <Steps steps={IOS} />
        </Tabs.Content>
        <Tabs.Content value="android">
          <Steps steps={ANDROID} />
        </Tabs.Content>
        <Tabs.Content value="living">
          <p className="mb-4 text-sm text-muted">
            iPhone only (Shortcuts app). Your lock screen updates itself every morning.
          </p>
          <Steps steps={LIVING} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function Tab({ value, icon, children }: { value: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className="flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] text-sm text-muted data-[state=active]:bg-gold data-[state=active]:font-semibold data-[state=active]:text-obsidian"
    >
      <span aria-hidden>{icon}</span>
      {children}
    </Tabs.Trigger>
  );
}

function Steps({ steps }: { steps: { t: string; d: string }[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={s.t} className="flex gap-4">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent font-mono text-sm tabular text-accent-text"
            aria-hidden
          >
            {i + 1}
          </span>
          <div>
            <p className="font-medium text-text">{s.t}</p>
            <p className="mt-0.5 text-sm text-muted">{s.d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
