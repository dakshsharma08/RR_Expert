# Wallpaper renderer: notes

One renderer (`shared/wallpaper/render.ts`) draws the lock-screen wallpaper in the browser (preview + PNG export) and on the server (`server/wallpaper/node-render.ts`, @napi-rs/canvas). Samples: `npx tsx scripts/render-samples.ts` → `docs/evidence/wallpapers/` (`_sheet-*.png` are contact sheets).

## Public API

```ts
renderWallpaper(ctx: Ctx2D, args: { design; data; createCanvas; image?; size? }): RenderReport
renderToLayer(args): { layer; report }
defaultDesign(template?, theme?, device?): WallpaperDesign
normalizeDesign(design): WallpaperDesign          // clamps sliders, fills gaps (use on stored/URL designs)
resolveSize(design): { width; height }
fontsToLoad(fontIds): string[]                     // browser: await document.fonts.load(s) for each before rendering
// server
registerWallpaperFonts(): FontRegistration[]
renderWallpaperPng(design, data, { image?, size? }): Promise<{ png: Buffer; report }>
```

Browser usage: `renderWallpaper(canvas.getContext('2d')!, { design, data, createCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }), image })`. `CanvasRenderingContext2D`, `OffscreenCanvasRenderingContext2D` and napi's `SKRSContext2D` all type-check against `Ctx2D` without casts.

## Pipeline

1. Background on an offscreen layer: theme gradient (or custom gradient), soft glow, photo (cover-fit, zoom/pan, blur by halving and regrowing, then "dim"), template texture (stars, blooms, paper), vignette, seeded grain tile (256 px, `createPattern`).
2. Layout: each template is a stack of rows measured by cap height. `stack()` puts it in the device's content band (`auto`/`upper`/`middle`/`lower`). If the boxes overflow the band (with a 24 reference-px slack for invisible text padding), it lays out again a little smaller (up to 6 tries).
3. Readability: for each text block the background layer is sampled (stride, about 4,000 samples). The contrast used is the worst of the mean, the 10th-percentile and the 90th-percentile colour. Below 4.5:1, a rounded dark or light scrim is added, with the alpha solved to reach at least 4.6 (capped at 0.75). Scrims span the content column and merge into one panel. `fixed: false` (with a suggestion) when the cap is not enough.
4. Draw rules, rings and text. Letter spacing is manual (the prefix is measured, so kerning is kept), rounded rects use arcs, and nothing uses `ctx.filter`, `letterSpacing` or `roundRect`.

## Decisions

- **Reference unit:** sizes are designed on 1080 × 2340; `u = min(W/1080, H/2340)`, so the 16:9 SE scales by height and nothing is squeezed.
- **Muted and accent text** are pushed to at least 4.8:1 against the hardest part of each theme background, so plain themes never need a scrim (the tests assert zero warnings). The raw accent is still used for lines and rings. On photos, muted text is lifted toward the main text colour.
- **"Dim"** veils the photo toward the theme base colour (darker on dark themes, paler on Ivory), so it always helps the theme's text.
- **States:** active shows "N days left". Upcoming shows days to the deadline with "Starts in N days" (from `startsInDays`, or derived from the other fields). Due today and expired show "0" with "Due today" / "Deadline passed". Completed shows "Done" / "Completed" at 100%. No seconds or clock times are ever rendered.
- **Ledger and Minimal Mono** are tables: `align` moves only their hero or footnote, not the columns.
- **Ivory Paper** always prints on light paper; dark themes only tint the paper and accent.
- **Constellation** uses `data.milestones` (`{ title, at, done }`) when present. Without it, it shows 5 evenly spaced waypoints lit up to the progress.
- **Server images:** `renderWallpaperPng` loads only `data:image/...` URLs or Buffers/Images, never remote URLs (that would be an SSRF risk).

## Fonts (server)

- @napi-rs/canvas 1.2.0 loads **.woff2 directly** (`GlobalFonts.registerFromPath(path, family)`). No conversion is needed. I checked this by rendering every family at 300/500/800 and looking at the PNG.
- Variable fonts keep their `wght` axis: one file gives 100–900. (`GlobalFonts.families` lists Fraunces as a single weight-900 face, but the weight variation still renders correctly.)
- Instrument Serif has only weight 400, and napi fakes a bold above 400. `fontCss` clamps it to 400.
- Files: `@fontsource-variable/{fraunces,inter,geist-mono}/files/*-latin-wght-normal.woff2`, `@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2`. They are resolved with `require.resolve`, so they work from any working directory. Latin subset only: other scripts fall back to system fonts on the server.

## Device sizes (portrait px), checked 23 Nov 2026

| Preset         | Size        | Model                                                                     | Source                                                                                                                                                                                                                 |
| -------------- | ----------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone SE      | 750 × 1334  | SE 2nd/3rd gen, 4.7″, 326 ppi (discontinued; kept for the 16:9 shape)     | [Apple Support 111866](https://support.apple.com/111866)                                                                                                                                                               |
| iPhone         | 1206 × 2622 | iPhone 17, 6.3″, 460 ppi. The base iPhone 18 is not out until spring 2027 | [Apple iPhone 17 specs](https://www.apple.com/iphone-17/specs/), [Apple Support 125089](https://support.apple.com/en-us/125089), [MacRumors](https://www.macrumors.com/2026/07/30/apple-skipping-iphone-18-this-year/) |
| iPhone Pro     | 1206 × 2622 | iPhone 18 Pro (same as 17 Pro), 6.3″                                      | [Apple Support 148590](https://support.apple.com/en-gb/148590), [Apple 17 Pro specs](https://www.apple.com/iphone-17-pro/specs/)                                                                                       |
| iPhone Pro Max | 1320 × 2868 | iPhone 18 Pro Max (same as 17 Pro Max), 6.9″                              | [Apple Support 148591](https://support.apple.com/en-ae/148591)                                                                                                                                                         |
| Pixel          | 1080 × 2424 | Pixel 11 (same as Pixel 10), 6.3″, 422 ppi                                | [Google Store Pixel 11](https://store.google.com/us/product/pixel_11_specs), [Pixel 10](https://store.google.com/us/product/pixel_10_specs)                                                                            |
| Galaxy S       | 1080 × 2340 | Galaxy S26 (same as S25), 6.3″ FHD+                                       | [Samsung S26 compare](https://www.samsung.com/uk/smartphones/galaxy-s26/compare/), [GSMArena S26 review](https://m.gsmarena.com/samsung_galaxy_s26-review-2942p3.php)                                                  |
| Android 1080p  | 1080 × 2400 | Common 20:9 FHD+ panel                                                    | generic                                                                                                                                                                                                                |

Not presets, but useful as a custom size: iPhone 17e 1170 × 2532 ([Apple](https://www.apple.com/iphone-17e/specs/)), Pixel 11 Pro 1280 × 2856 and Pro XL 1344 × 2992 ([Google](https://store.google.com/us/product/pixel_11_pro_specs)).

`www.apple.com` could not be fetched directly from this sandbox (DNS blocked), so the Apple figures were confirmed through search results that quote Apple's own regional spec and support pages.

## Safe zones (fractions of height)

These are estimates from the iOS 26 and Android 16/One UI 8 lock-screen layouts (status bar, date and clock, widget row, notification stack, bottom buttons or fingerprint icon). The **content band** is where text may go: iOS 0.355–0.85, SE 0.35–0.85, Pixel/Android 0.345–0.81, Galaxy 0.335–0.81, all with side margins of 8–8.5 %. Notifications can still overlap the lower part of the band when present, so templates put the numeral high and the stamp low. Worth checking on real devices.

## Known limitations

- Safe zones are approximate. iOS lets users enlarge the clock or move widgets.
- Server text is Latin-only (fontsource latin subsets).
- Grain and blur use bilinear resampling, so browser and Skia output differ by a pixel or so (not byte-identical across engines, but deterministic within one).
- "Small caps" are tracked uppercase (canvas has no portable `font-variant-caps`).
