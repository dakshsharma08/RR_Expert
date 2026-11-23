/**
 * Server-side wallpaper rendering with @napi-rs/canvas (Skia).
 *
 * Key ideas (for learners):
 * - This file is the ONLY place that knows about napi. It registers the same
 *   font files the browser uses (from the fontsource packages) under the same
 *   family names, then calls the shared `renderWallpaper`, so a server PNG
 *   matches the in-app preview.
 * - @napi-rs/canvas 1.2 reads .woff2 directly (Skia decodes it), so no font
 *   conversion is needed. Variable fonts keep their weight axis: one file
 *   gives every weight from 100 to 900.
 * - Background images: we only accept data: URLs, Buffers or already-made
 *   images here. Fetching arbitrary URLs from a server is a security risk
 *   (it could be pointed at internal addresses), so the route must download
 *   and validate images itself if it ever needs to.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { GlobalFonts, Image, createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import {
  FONT_FAMILIES,
  renderWallpaper,
  resolveSize,
  normalizeDesign,
  type CanvasFactory,
  type FontId,
  type ImageLike,
  type RenderReport,
  type WallpaperData,
  type WallpaperDesign,
} from '../../shared/wallpaper';

const require = createRequire(import.meta.url);

/** Which file to register for each font (latin subset, upright). */
const FONT_FILES: Record<FontId, { pkg: string; file: string }> = {
  fraunces: { pkg: '@fontsource-variable/fraunces', file: 'fraunces-latin-wght-normal.woff2' },
  inter: { pkg: '@fontsource-variable/inter', file: 'inter-latin-wght-normal.woff2' },
  'geist-mono': { pkg: '@fontsource-variable/geist-mono', file: 'geist-mono-latin-wght-normal.woff2' },
  'instrument-serif': {
    pkg: '@fontsource/instrument-serif',
    file: 'instrument-serif-latin-400-normal.woff2',
  },
};

export interface FontRegistration {
  font: FontId;
  family: string;
  path: string | null;
  ok: boolean;
}

let registered: FontRegistration[] | null = null;

/** Locate a package's folder through Node's resolver (works from any working directory). */
function packageDir(pkg: string): string | null {
  try {
    return dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    const local = join(process.cwd(), 'node_modules', pkg);
    return existsSync(local) ? local : null;
  }
}

/** Register the four wallpaper fonts once per process. Safe to call many times. */
export function registerWallpaperFonts(): FontRegistration[] {
  if (registered) return registered;
  registered = (Object.keys(FONT_FILES) as FontId[]).map((font) => {
    const { pkg, file } = FONT_FILES[font];
    const family = FONT_FAMILIES[font].family;
    const dir = packageDir(pkg);
    const path = dir ? join(dir, 'files', file) : null;
    if (!path || !existsSync(path)) return { font, family, path, ok: false };
    // Registering under the browser's family name is what keeps both renders identical.
    const key = GlobalFonts.registerFromPath(path, family);
    return { font, family, path, ok: key !== null && GlobalFonts.has(family) };
  });
  return registered;
}

/**
 * napi's createCanvas as the renderer's offscreen-layer factory. No cast is
 * needed: napi's Canvas already matches the renderer's small `Layer` shape.
 */
export const napiCanvasFactory: CanvasFactory = (w, h) =>
  createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));

export type BackgroundSource = Buffer | string | Image | Canvas | ImageLike | null | undefined;

/** Turn a Buffer / data: URL / image into something drawImage accepts. Returns null on failure. */
export async function loadBackground(src: BackgroundSource): Promise<ImageLike | null> {
  if (!src) return null;
  if (typeof src === 'string') {
    if (!src.startsWith('data:image/')) return null; // see the security note at the top
    try {
      return await loadImage(src);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(src)) {
    try {
      return await loadImage(src);
    } catch {
      return null;
    }
  }
  return src;
}

export interface NodeRenderOptions {
  /** Background image (Buffer, data: URL, napi Image/Canvas). Defaults to design.background.image.src when it is a data: URL. */
  image?: BackgroundSource;
  /** Override the output size (defaults to the device preset). */
  size?: { width: number; height: number };
}

/** Render a wallpaper to a PNG Buffer. */
export async function renderWallpaperPng(
  design: WallpaperDesign,
  data: WallpaperData,
  opts: NodeRenderOptions = {},
): Promise<{ png: Buffer; report: RenderReport }> {
  registerWallpaperFonts();
  const d = normalizeDesign(design);
  const size = opts.size ?? resolveSize(d);
  const image =
    d.background.kind === 'image'
      ? await loadBackground(opts.image ?? d.background.image?.src ?? null)
      : null;
  const canvas = createCanvas(size.width, size.height);
  const report = renderWallpaper(canvas.getContext('2d'), {
    design: d,
    data,
    createCanvas: napiCanvasFactory,
    image,
    size,
  });
  const png = await canvas.encode('png');
  return { png, report };
}
