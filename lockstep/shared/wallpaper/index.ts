/**
 * LOCKSTEP wallpaper — public API (shared by the browser and the server).
 *
 *   renderWallpaper(ctx, { design, data, createCanvas, image? }) → RenderReport
 *   defaultDesign(template?, theme?, device?) → WallpaperDesign
 *   resolveSize(design) → { width, height }
 */
export * from './types';
export {
  renderWallpaper,
  renderToLayer,
  familiesFor,
  MIN_CONTRAST,
  MAX_SCRIM_ALPHA,
  BAND_SLACK,
  type RenderArgs,
} from './render';
export { DEVICES, DEVICE_LIST, CUSTOM_LIMITS, getDevice, resolveSize } from './devices';
export { THEMES, THEME_LIST, BRAND, makePalette, paperPalette, type Theme, type Palette } from './themes';
export { TEMPLATES, TEMPLATE_LIST, getTemplate, defaultDesign, normalizeDesign } from './templates';
export type { TemplateDef, TemplateDefaults } from './templates/kit';
export { FONT_FAMILIES, FONT_IDS, fontCss, fontsToLoad, clampWeight, type FontInfo } from './fonts';
export {
  parseColor,
  relativeLuminance,
  contrastRatio,
  contrastFromLuminance,
  luminanceOf,
  ensureContrast,
  mix,
  withAlpha,
  type RGBA,
} from './contrast';
export { drawTracked, measureTracked, wrapLines, ellipsize } from './text';
