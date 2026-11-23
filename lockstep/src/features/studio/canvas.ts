/**
 * Browser glue for the shared wallpaper renderer:
 *  - a CanvasFactory that makes offscreen <canvas> layers,
 *  - font preloading (so exports never fall back to a system font),
 *  - loading uploaded background images from IndexedDB as local blobs
 *    (a blob URL is same-origin, so the canvas is never "tainted" and can export),
 *  - the native-resolution PNG export.
 */
import '@fontsource/instrument-serif/400.css';
import { db, uid } from '@/db/db';
import { renderWallpaper, type RenderArgs } from '@shared/wallpaper/render';
import { fontsToLoad, FONT_FAMILIES } from '@shared/wallpaper/fonts';
import { resolveSize } from '@shared/wallpaper/devices';
import { normalizeDesign } from '@shared/wallpaper/templates';
import type {
  CanvasFactory,
  Ctx2D,
  ImageLike,
  RenderReport,
  WallpaperData,
  WallpaperDesign,
} from '@shared/wallpaper/types';

export const browserCanvas: CanvasFactory = (width, height) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c as unknown as ReturnType<CanvasFactory>;
};

const loadedFonts = new Set<string>();

/** Load every face a design uses, then wait for document.fonts.ready. */
export async function ensureFonts(design: WallpaperDesign): Promise<void> {
  const t = design.typography;
  const ids = [t.display, t.ui, t.numbers];
  const specs = [
    ...fontsToLoad(ids),
    ...ids.flatMap((id) => [300, 400, 500, 600, 700].map((w) => `${w} 32px "${FONT_FAMILIES[id].family}"`)),
  ].filter((s) => !loadedFonts.has(s));
  if (specs.length && 'fonts' in document) {
    await Promise.all(
      specs.map((s) =>
        document.fonts
          .load(s)
          .then(() => loadedFonts.add(s))
          .catch(() => undefined),
      ),
    );
  }
  if ('fonts' in document) await document.fonts.ready;
}

/** Preload the whole font set once (landing/cover use several templates). */
export async function ensureAllFonts(): Promise<void> {
  const specs = (Object.keys(FONT_FAMILIES) as (keyof typeof FONT_FAMILIES)[]).flatMap((id) =>
    [300, 400, 600].map((w) => `${w} 32px "${FONT_FAMILIES[id].family}"`),
  );
  await Promise.all(specs.map((s) => document.fonts.load(s).catch(() => undefined)));
  await document.fonts.ready;
}

// ───────────── Background images (stored as Blobs in IndexedDB) ─────────────

const imageCache = new Map<string, Promise<ImageLike | null>>();

export async function saveImageBlob(file: Blob, name: string): Promise<string> {
  const id = uid();
  await db.images.add({ id, blob: file, name, created_at: new Date().toISOString() });
  return `idb:${id}`;
}

/** Resolve "idb:<id>" to a decoded image. Returns null if it's gone. */
export function loadDesignImage(src: string | undefined): Promise<ImageLike | null> {
  if (!src) return Promise.resolve(null);
  const hit = imageCache.get(src);
  if (hit) return hit;
  const p = (async () => {
    let blob: Blob | undefined;
    if (src.startsWith('idb:')) blob = (await db.images.get(src.slice(4)))?.blob;
    else if (src.startsWith('blob:') || src.startsWith('data:')) blob = await (await fetch(src)).blob();
    if (!blob) return null;
    if ('createImageBitmap' in window) {
      try {
        return (await createImageBitmap(blob)) as unknown as ImageLike;
      } catch {
        /* fall through to <img> */
      }
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img as unknown as ImageLike;
  })();
  imageCache.set(src, p);
  return p;
}

// ───────────── Render helpers ─────────────

export function renderTo(canvas: HTMLCanvasElement, args: Omit<RenderArgs, 'createCanvas'>): RenderReport {
  const ctx = canvas.getContext('2d') as unknown as Ctx2D | null;
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  return renderWallpaper(ctx, {
    ...args,
    createCanvas: browserCanvas,
    size: { width: canvas.width, height: canvas.height },
  });
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  report: RenderReport;
}

/** Render offscreen at the device's NATIVE pixel size and encode a PNG. */
export async function exportPng(design: WallpaperDesign, data: WallpaperData): Promise<ExportResult> {
  const d = normalizeDesign(design);
  await ensureFonts(d);
  const image = d.background.kind === 'image' ? await loadDesignImage(d.background.image?.src) : null;
  const { width, height } = resolveSize(d);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const report = renderTo(canvas, { design: d, data, image });
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the PNG.'))), 'image/png'),
  );
  // Verify the real pixel size from the PNG header (bytes 16–23 of the IHDR chunk).
  const head = new DataView(await blob.slice(0, 24).arrayBuffer());
  const w = head.getUint32(16);
  const h = head.getUint32(20);
  if (w !== width || h !== height)
    throw new Error(`Export size mismatch: got ${w}×${h}, expected ${width}×${height}.`);
  return { blob, width: w, height: h, report };
}

export function slugify(s: string, max = 40): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/g, '') || 'goal'
  );
}

export function exportFilename(goalTitle: string, device: string, dateKey: string): string {
  return `lockstep-${slugify(goalTitle)}-${device}-${dateKey}.png`;
}

/** Small JPEG data URL for the design library grid. */
export function thumbnailFrom(canvas: HTMLCanvasElement, width = 180): string {
  const t = document.createElement('canvas');
  t.width = width;
  t.height = Math.round((canvas.height / canvas.width) * width);
  t.getContext('2d')!.drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.8);
}
