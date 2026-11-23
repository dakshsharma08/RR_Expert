/**
 * Incremental parser for the plan JSON while Gemini is still writing it.
 *
 * Why (for learners): a plan takes several seconds to generate. Instead of
 * showing a spinner until the very end, we look at the partial text after every
 * chunk and pull out pieces that are already COMPLETE:
 *   - `feasibility` + `feasibilityReason` (top-level strings), and
 *   - each finished object inside the top-level `milestones` array.
 *
 * How: we scan the text once, character by character, remembering:
 *   - whether we are inside a string (and whether the previous char was a
 *     backslash, so `\"` does not end the string),
 *   - a stack of open `{` / `[` (brace-depth scanning),
 *   - the most recent top-level key.
 * When a `{` opens directly inside the top-level `milestones` array we note its
 * position; when the matching `}` closes we JSON.parse exactly that slice.
 * Braces inside strings are ignored because we skip string contents.
 *
 * Previews only: the final plan is parsed and validated once the stream ends.
 */
import { FEASIBILITY, MilestoneSchema, type Feasibility, type PlanMilestone } from '../../shared/plan';

export type ParsedPlanEvent =
  | { type: 'feasibility'; feasibility: Feasibility; feasibilityReason: string }
  | { type: 'milestone'; index: number; milestone: PlanMilestone };

export class PlanStreamParser {
  private buf = '';
  private pos = 0;
  private readonly stack: Array<'{' | '['> = [];
  private inString = false;
  private escaped = false;
  private stringStart = -1;
  private stringIsKey = false;
  /** At depth 1 (inside the root object): is the next string a key? */
  private expectKey = false;
  private currentKey: string | null = null;
  private milestoneStart = -1;
  private milestoneIndex = 0;
  private feasibility: string | null = null;
  private reason: string | null = null;
  private feasibilitySent = false;
  private rootClosed = false;

  /** Everything received so far. */
  get text(): string {
    return this.buf;
  }

  /** Add a chunk of text; returns the events that became complete because of it. */
  push(chunk: string): ParsedPlanEvent[] {
    this.buf += chunk;
    const out: ParsedPlanEvent[] = [];
    const buf = this.buf;
    for (; this.pos < buf.length && !this.rootClosed; this.pos++) {
      const ch = buf[this.pos];

      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === '\\') this.escaped = true;
        else if (ch === '"') {
          this.inString = false;
          this.onStringEnd(out);
        }
        continue;
      }

      // Before the root object starts (e.g. a stray ```json fence), wait for "{".
      if (this.stack.length === 0) {
        if (ch === '{') {
          this.stack.push('{');
          this.expectKey = true;
        }
        continue;
      }

      switch (ch) {
        case '"':
          this.inString = true;
          this.stringStart = this.pos;
          this.stringIsKey = this.stack.length === 1 && this.expectKey;
          break;
        case '{':
          if (this.inMilestonesArray()) this.milestoneStart = this.pos;
          this.stack.push('{');
          break;
        case '[':
          this.stack.push('[');
          break;
        case '}':
        case ']':
          this.stack.pop();
          if (ch === '}' && this.milestoneStart >= 0 && this.inMilestonesArray()) {
            this.onMilestoneEnd(out);
          }
          if (this.stack.length === 0) this.rootClosed = true;
          break;
        case ':':
          if (this.stack.length === 1) this.expectKey = false;
          break;
        case ',':
          if (this.stack.length === 1) this.expectKey = true;
          break;
        default:
          break;
      }
    }
    return out;
  }

  /** True when the innermost open container is the top-level `milestones` array. */
  private inMilestonesArray(): boolean {
    return this.stack.length === 2 && this.stack[1] === '[' && this.currentKey === 'milestones';
  }

  private onStringEnd(out: ParsedPlanEvent[]) {
    if (this.stack.length !== 1) return;
    const value = decodeJsonString(this.buf.slice(this.stringStart, this.pos + 1));
    if (value === null) return;
    if (this.stringIsKey) {
      this.currentKey = value;
      return;
    }
    if (this.currentKey === 'feasibility') this.feasibility = value;
    else if (this.currentKey === 'feasibilityReason') this.reason = value;
    else return;

    if (!this.feasibilitySent && this.feasibility !== null && this.reason !== null) {
      this.feasibilitySent = true;
      if ((FEASIBILITY as readonly string[]).includes(this.feasibility)) {
        out.push({
          type: 'feasibility',
          feasibility: this.feasibility as Feasibility,
          feasibilityReason: this.reason,
        });
      }
    }
  }

  private onMilestoneEnd(out: ParsedPlanEvent[]) {
    const index = this.milestoneIndex++;
    const slice = this.buf.slice(this.milestoneStart, this.pos + 1);
    this.milestoneStart = -1;
    try {
      const parsed = MilestoneSchema.safeParse(JSON.parse(slice));
      // A malformed milestone is skipped here; final validation will report it.
      if (parsed.success) out.push({ type: 'milestone', index, milestone: parsed.data });
    } catch {
      /* not valid JSON yet — ignore, the final parse decides */
    }
  }
}

function decodeJsonString(quoted: string): string | null {
  try {
    const v: unknown = JSON.parse(quoted);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Pull the JSON object out of a model response. With responseMimeType
 * 'application/json' this is normally the whole text, but we tolerate a
 * ```json fence or stray words around it.
 */
export function extractJsonText(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return text.trim();
  return text.slice(start, end + 1);
}

/** JSON.parse that returns `undefined` instead of throwing. */
export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(extractJsonText(text));
  } catch {
    return undefined;
  }
}
