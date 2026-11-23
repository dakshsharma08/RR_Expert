/**
 * POST /api/background: an abstract, text-free wallpaper background from an
 * image-capable Gemini model.
 *
 * Shown in the app ONLY when such a model is listed for the key (GET /api/health ->
 * ai.imageModel). If a call proves the model doesn't work with this key, we hide the
 * feature again for an hour instead of failing repeatedly.
 */
import { z } from 'zod';
import type { BackgroundResponse } from '../../shared/api';
import { AppError } from '../lib/errors';
import { callGemini, type CallContext } from './call';

export const BackgroundRequestSchema = z.object({
  theme: z.enum(['champagne-gold', 'ivory', 'monochrome', 'midnight-sapphire', 'rose-gold', 'emerald-noir']),
  mood: z.enum(['calm', 'focused', 'bold']).default('calm'),
});
export type BackgroundRequest = z.infer<typeof BackgroundRequestSchema>;

const PALETTE: Record<BackgroundRequest['theme'], string> = {
  'champagne-gold': 'near-black with warm champagne-gold light',
  ivory: 'soft warm ivory paper tones with faint beige shadows',
  monochrome: 'deep graphite and soft grey light',
  'midnight-sapphire': 'midnight navy with a cool sapphire glow',
  'rose-gold': 'deep warm black with muted rose-gold light',
  'emerald-noir': 'deep black-green with a faint emerald glow',
};

const MOOD: Record<BackgroundRequest['mood'], string> = {
  calm: 'slow, soft, very low contrast',
  focused: 'a single gentle light source drawing the eye to the centre',
  bold: 'a confident sweep of light, still minimal',
};

export function buildBackgroundPrompt(req: BackgroundRequest): string {
  return [
    'Create an ABSTRACT phone lock-screen background in portrait 9:16.',
    'Absolutely no text, letters, numbers, logos, symbols, people, faces, hands or bodies.',
    `Palette: ${PALETTE[req.theme]}. Mood: ${MOOD[req.mood]}.`,
    'Style: quiet luxury, editorial calm, premium watchmaker. Smooth gradients, subtle film grain, soft light bloom.',
    'Keep the middle third dark and quiet so large text stays readable on top. No neon, no heavy glow.',
  ].join(' ');
}

// Image models look like gemini-2.5-flash-image, gemini-3-pro-image-preview…
const IMAGE_MODEL = /^gemini-(\d+)(?:\.(\d+))?-(flash|pro)-image(-preview)?$/;

/** Pick the newest image-capable Gemini model; stable beats preview, flash beats pro (cost). */
export function pickImageModel(names: readonly string[]): string | null {
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return 0;
  };
  let best: { name: string; key: number[] } | null = null;
  for (const raw of names) {
    const name = raw.replace(/^models\//, '');
    const m = IMAGE_MODEL.exec(name);
    if (!m) continue;
    // [stable?, major, minor, flash?] — bigger wins
    const key = [m[4] ? 0 : 1, Number(m[1]), Number(m[2] ?? 0), m[3] === 'flash' ? 1 : 0];
    if (!best || cmp(key, best.key) > 0) best = { name, key };
  }
  return best?.name ?? null;
}

/** Finds and remembers the image model; can be told the model failed. */
export class ImageModelResolver {
  private cached: { model: string | null; until: number } | null = null;
  private brokenUntil = 0;
  constructor(
    /** Where model names come from (shared with the text-model resolver's cached listing). */
    private readonly listNames: () => Promise<string[]>,
    private readonly opts: { pinned: string | null; cacheMs: number; nowMs?: () => number },
  ) {}
  private now() {
    return (this.opts.nowMs ?? Date.now)();
  }
  async resolve(): Promise<string | null> {
    if (this.brokenUntil > this.now()) return null;
    if (this.opts.pinned) return this.opts.pinned;
    if (this.cached && this.cached.until > this.now()) return this.cached.model;
    let model: string | null;
    try {
      model = pickImageModel(await this.listNames());
    } catch {
      model = null;
    }
    this.cached = { model, until: this.now() + this.opts.cacheMs };
    return model;
  }
  markBroken(ms = 60 * 60 * 1000) {
    this.brokenUntil = this.now() + ms;
  }
}

export async function generateBackground(
  call: CallContext,
  images: ImageModelResolver,
  req: BackgroundRequest,
): Promise<BackgroundResponse> {
  const model = await images.resolve();
  if (!model)
    throw new AppError(
      'AI_NOT_CONFIGURED',
      'AI backgrounds need an image-capable Gemini model, and none is available for this key.',
    );
  let response;
  try {
    response = await callGemini(call, {
      kind: 'background',
      model,
      retries: 1,
      request: {
        contents: [{ role: 'user', parts: [{ text: buildBackgroundPrompt(req) }] }],
        config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
      },
    });
  } catch (err) {
    // A 400/404 means this model doesn't do images for this key → hide the feature for a while.
    if (
      err instanceof AppError &&
      (err.code === 'INVALID_INPUT' || err.code === 'INTERNAL' || err.code === 'NOT_FOUND')
    )
      images.markBroken();
    throw err;
  }
  const part = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'),
  );
  const run = call.runs[call.runs.length - 1];
  if (!part?.inlineData?.data || !run)
    throw new AppError('INTERNAL', 'Gemini did not return an image. Please try again.');
  return { image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, model, run };
}
