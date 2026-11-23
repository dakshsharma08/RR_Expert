/**
 * Phone screen presets.
 *
 * Key ideas (for learners):
 * - Sizes are NATIVE PIXELS in portrait (width × height), the size a wallpaper
 *   must be to look sharp. Sources are listed in docs/notes/wallpaper.md.
 * - Lock screens draw the clock, widgets, notifications and shortcut buttons on
 *   top of the wallpaper. `safe` records roughly where each sits, as fractions
 *   of the screen height, and `content` is the band where our text may go:
 *   below the clock and widgets, above the bottom buttons. Fractions (not
 *   pixels) let the same numbers work for a custom size with a similar shape.
 * - The notification stack still overlaps the lower part of the band when
 *   notifications are showing; templates put the most important things (the
 *   big number) high, and the least important (the "Updated" stamp) low.
 */
import type { DeviceId, DevicePreset, SafeZones, WallpaperDesign } from './types';

// iPhones with Face ID (Dynamic Island): status bar, date + clock, a row of
// widgets, notifications stacking up from the bottom, flashlight/camera buttons.
const IOS_FACE_ID: SafeZones = {
  statusBar: [0, 0.062],
  clock: [0.062, 0.24],
  widgets: [0.24, 0.33],
  notifications: [0.64, 0.865],
  bottomControls: [0.865, 1],
};
const IOS_CONTENT = { top: 0.355, bottom: 0.85, side: 0.085 };

// iPhone SE (Touch ID, 16:9): shorter screen, same lock-screen pieces.
const IOS_SE: SafeZones = {
  statusBar: [0, 0.035],
  clock: [0.035, 0.245],
  widgets: [0.245, 0.33],
  notifications: [0.6, 0.86],
  bottomControls: [0.86, 1],
};
const IOS_SE_CONTENT = { top: 0.35, bottom: 0.85, side: 0.08 };

// Pixel / Android 16–17: big clock top-left, At a Glance under it, notifications
// listed below the clock, fingerprint icon low in the middle, shortcuts in the corners.
const ANDROID: SafeZones = {
  statusBar: [0, 0.035],
  clock: [0.035, 0.27],
  widgets: [0.27, 0.32],
  notifications: [0.32, 0.8],
  bottomControls: [0.82, 1],
};
const ANDROID_CONTENT = { top: 0.345, bottom: 0.81, side: 0.08 };

// Samsung One UI 8: clock a little higher and smaller, shortcuts at the bottom corners.
const ONE_UI: SafeZones = {
  statusBar: [0, 0.035],
  clock: [0.035, 0.25],
  widgets: [0.25, 0.31],
  notifications: [0.31, 0.8],
  bottomControls: [0.82, 1],
};
const ONE_UI_CONTENT = { top: 0.335, bottom: 0.81, side: 0.08 };

export const DEVICES: Record<Exclude<DeviceId, 'custom'>, DevicePreset> = {
  'iphone-se': {
    id: 'iphone-se',
    label: 'iPhone SE',
    detail: 'SE 2nd/3rd gen · 4.7″ · 750 × 1334',
    width: 750,
    height: 1334,
    platform: 'ios',
    safe: IOS_SE,
    content: IOS_SE_CONTENT,
  },
  iphone: {
    id: 'iphone',
    label: 'iPhone',
    detail: 'iPhone 17 · 6.3″ · 1206 × 2622',
    width: 1206,
    height: 2622,
    platform: 'ios',
    safe: IOS_FACE_ID,
    content: IOS_CONTENT,
  },
  'iphone-pro': {
    id: 'iphone-pro',
    label: 'iPhone Pro',
    detail: 'iPhone 18 Pro / 17 Pro · 6.3″ · 1206 × 2622',
    width: 1206,
    height: 2622,
    platform: 'ios',
    safe: IOS_FACE_ID,
    content: IOS_CONTENT,
  },
  'iphone-pro-max': {
    id: 'iphone-pro-max',
    label: 'iPhone Pro Max',
    detail: 'iPhone 18 Pro Max / 17 Pro Max · 6.9″ · 1320 × 2868',
    width: 1320,
    height: 2868,
    platform: 'ios',
    safe: IOS_FACE_ID,
    content: IOS_CONTENT,
  },
  pixel: {
    id: 'pixel',
    label: 'Pixel',
    detail: 'Pixel 11 / 10 · 6.3″ · 1080 × 2424',
    width: 1080,
    height: 2424,
    platform: 'android',
    safe: ANDROID,
    content: ANDROID_CONTENT,
  },
  'galaxy-s': {
    id: 'galaxy-s',
    label: 'Galaxy S',
    detail: 'Galaxy S26 / S25 · 6.3″ · 1080 × 2340',
    width: 1080,
    height: 2340,
    platform: 'android',
    safe: ONE_UI,
    content: ONE_UI_CONTENT,
  },
  'android-1080': {
    id: 'android-1080',
    label: 'Android 1080p',
    detail: 'Most Android phones · 1080 × 2400',
    width: 1080,
    height: 2400,
    platform: 'android',
    safe: ANDROID,
    content: ANDROID_CONTENT,
  },
};

export const DEVICE_LIST: DevicePreset[] = Object.values(DEVICES);

/** Limits for custom sizes: big enough to be useful, small enough not to exhaust memory. */
export const CUSTOM_LIMITS = { min: 320, max: 4096 } as const;

/**
 * The preset for a design. A custom size borrows the safe zones of the closest
 * preset by aspect ratio (a tall custom size behaves like a modern phone, a
 * 16:9 one like the SE).
 */
export function getDevice(id: DeviceId, custom?: { width: number; height: number }): DevicePreset {
  if (id !== 'custom') return DEVICES[id];
  const { width, height } = clampCustom(custom);
  const ratio = height / width;
  const closest = DEVICE_LIST.reduce((best, d) =>
    Math.abs(d.height / d.width - ratio) < Math.abs(best.height / best.width - ratio) ? d : best,
  );
  return { ...closest, id: 'custom', label: 'Custom', detail: `${width} × ${height}`, width, height };
}

function clampCustom(custom?: { width: number; height: number }): { width: number; height: number } {
  const c = (v: number | undefined, fallback: number) =>
    Math.round(
      Math.min(CUSTOM_LIMITS.max, Math.max(CUSTOM_LIMITS.min, Number.isFinite(v) ? (v as number) : fallback)),
    );
  return { width: c(custom?.width, 1080), height: c(custom?.height, 2400) };
}

/** Output size in pixels for a design. */
export function resolveSize(design: Pick<WallpaperDesign, 'device' | 'custom'>): {
  width: number;
  height: number;
} {
  const d = getDevice(design.device, design.custom);
  return { width: d.width, height: d.height };
}
