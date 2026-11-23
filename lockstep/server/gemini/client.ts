/**
 * The Gemini client and model selection.
 *
 * Why (for learners):
 * - `GeminiLike` is the small slice of the @google/genai SDK we actually use.
 *   The real `GoogleGenAI` object fits it, and tests could pass a fake. (Our
 *   integration tests use the REAL SDK and mock the network with MSW instead.)
 * - Model names change often, so by default we don't hard-code one. We ask the
 *   API which models this key can use (`models.list()`), keep only STABLE Flash
 *   models (`gemini-X.Y-flash`, no -lite/-preview/-exp/-image/-tts/-live) and pick
 *   the newest version. The answer is cached for an hour. If listing fails we use
 *   Google's moving alias `gemini-flash-latest`.
 */
import {
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type ListModelsParameters,
  type Model,
} from '@google/genai';

export interface GeminiLike {
  models: {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
    generateContentStream(
      params: GenerateContentParameters,
    ): Promise<AsyncGenerator<GenerateContentResponse>>;
    list(params?: ListModelsParameters): Promise<AsyncIterable<Model>>;
  };
}

/** The ONLY place the API key is used. It goes to the SDK, which sends it as the x-goog-api-key header. */
export function createGeminiClient(apiKey: string): GeminiLike {
  return new GoogleGenAI({ apiKey });
}

export const FALLBACK_MODEL = 'gemini-flash-latest';

// gemini-3.8-flash, gemini-3-flash and pinned stable revisions like gemini-2.0-flash-001.
const STABLE_FLASH = /^gemini-(\d+)(?:\.(\d+))?-flash(?:-(\d{3}))?$/;

/** Pick the newest stable Flash model from a list of names ("models/…" prefixes allowed). */
export function pickNewestStableFlash(names: readonly string[]): string | null {
  let best: { name: string; key: [number, number, number] } | null = null;
  for (const raw of names) {
    const name = raw.replace(/^models\//, '');
    const m = STABLE_FLASH.exec(name);
    if (!m) continue;
    const key: [number, number, number] = [Number(m[1]), Number(m[2] ?? 0), m[3] ? Number(m[3]) : 1000];
    // The un-suffixed name (rank 1000) is the always-current alias of that version, so prefer it.
    if (!best || compareKey(key, best.key) > 0) best = { name, key };
  }
  return best?.name ?? null;
}

function compareKey(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** Gemini 2.5+ and the moving aliases can "think"; older models reject thinkingConfig. */
export function supportsThinking(model: string): boolean {
  if (/latest/.test(model)) return true;
  const m = /gemini-(\d+)(?:\.(\d+))?/.exec(model);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2] ?? 0);
  return major > 2 || (major === 2 && minor >= 5);
}

export interface ModelResolverOptions {
  pinned: string | null;
  heavy: string | null;
  cacheMs: number;
  /** How long to remember a FAILED lookup before trying models.list() again. */
  failCacheMs?: number;
  nowMs?: () => number;
}

export class ModelResolver {
  private cached: { model: string; until: number } | null = null;
  private inflight: Promise<string> | null = null;
  private readonly nowMs: () => number;

  constructor(
    private readonly gemini: GeminiLike,
    private readonly opts: ModelResolverOptions,
  ) {
    this.nowMs = opts.nowMs ?? Date.now;
  }

  get heavy(): string | null {
    return this.opts.heavy;
  }

  /** The default model name. Never throws: falls back to the alias. */
  async resolve(): Promise<string> {
    if (this.opts.pinned) return this.opts.pinned;
    if (this.cached && this.cached.until > this.nowMs()) return this.cached.model;
    // If several requests arrive at once, they share one models.list() call.
    this.inflight ??= this.lookup().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async lookup(): Promise<string> {
    try {
      const picked = pickNewestStableFlash(await this.listedNames());
      if (picked) {
        this.cached = { model: picked, until: this.nowMs() + this.opts.cacheMs };
        return picked;
      }
    } catch {
      // Listing failed (network, permissions…). The alias below still works.
    }
    this.cached = { model: FALLBACK_MODEL, until: this.nowMs() + (this.opts.failCacheMs ?? 5 * 60 * 1000) };
    return FALLBACK_MODEL;
  }

  private names: { list: string[]; until: number } | null = null;
  private namesInflight: Promise<string[]> | null = null;

  /**
   * Model names this key can call (cached). Shared by the text-model choice and the
   * image-model discovery, so /api/health lists models at most once per cache period.
   */
  async listedNames(): Promise<string[]> {
    if (this.names && this.names.until > this.nowMs()) return this.names.list;
    this.namesInflight ??= this.fetchNames().finally(() => {
      this.namesInflight = null;
    });
    return this.namesInflight;
  }

  private async fetchNames(): Promise<string[]> {
    const names: string[] = [];
    // A timeout so /api/health can never hang on a slow listing.
    const pager = await this.gemini.models.list({
      config: { pageSize: 100, abortSignal: AbortSignal.timeout(10_000) },
    });
    for await (const model of pager) {
      const actions = model.supportedActions;
      if (model.name && (!actions || actions.includes('generateContent'))) names.push(model.name);
      if (names.length > 500) break;
    }
    this.names = { list: names, until: this.nowMs() + this.opts.cacheMs };
    return names;
  }
}
