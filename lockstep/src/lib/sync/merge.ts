/**
 * Pure sync logic: no network, no database, so it is easy to unit-test.
 *
 * "Last write wins" (LWW): when the same row was changed on two devices, the
 * version with the later `updated_at` is kept and the other is overwritten.
 * It is simple and predictable; the cost is that two edits to the SAME row
 * made between syncs do not get combined (the older one is lost).
 */

/** Anything we can merge: it has an id and the time it was last edited. */
export interface Versioned {
  id: string;
  updated_at: string;
}

export interface MergeResult<T> {
  /** Rows the cloud has that are new or newer: write them into Dexie. */
  toLocal: T[];
  /** Rows this device has that are new or newer: upload them. */
  toRemote: T[];
}

/** ISO text → milliseconds. Unreadable times count as "very old" so real edits win. */
export function toMillis(iso: string | null | undefined): number {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Compare local and remote versions by id.
 *  - only remote has it → toLocal
 *  - only local has it  → toRemote
 *  - both have it       → the later `updated_at` wins; a TIE goes to remote,
 *                         so every device settles on the cloud's copy.
 * Times are compared as instants (Date.parse), because Postgres writes
 * "…+00:00" where JavaScript writes "…Z" for the same moment.
 */
export function mergeRows<T extends Versioned>(local: readonly T[], remote: readonly T[]): MergeResult<T> {
  const remoteById = latestById(remote);
  const localById = latestById(local);
  const toLocal: T[] = [];
  const toRemote: T[] = [];

  for (const [id, r] of remoteById) {
    const l = localById.get(id);
    if (!l || toMillis(r.updated_at) >= toMillis(l.updated_at)) toLocal.push(r);
    else toRemote.push(l);
  }
  for (const [id, l] of localById) {
    if (!remoteById.has(id)) toRemote.push(l);
  }
  return { toLocal, toRemote };
}

/** If a list has the same id twice, keep the newest copy. */
function latestById<T extends Versioned>(rows: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const seen = map.get(row.id);
    if (!seen || toMillis(row.updated_at) >= toMillis(seen.updated_at)) map.set(row.id, row);
  }
  return map;
}

export interface DeletionInput {
  /** Ids that BOTH sides had at the end of the last successful sync. */
  known: Iterable<string>;
  /** Ids on this device right now. */
  localIds: Iterable<string>;
  /** Ids in the cloud right now. */
  remoteIds: Iterable<string>;
  /** Ids edited on this device since the last sync. */
  localChanged: Iterable<string>;
  /** Ids edited in the cloud since the last sync. */
  remoteChanged: Iterable<string>;
}

/**
 * The app deletes rows for real (no "deleted" flag), so we spot deletions by
 * what went MISSING: if both sides had a row last time and one side no longer
 * has it, that side deleted it and the other side should too.
 * Exception: if the other side EDITED the row since, the edit wins and the row
 * comes back. Losing a deletion is better than losing someone's work.
 */
export function planDeletions(input: DeletionInput): { deleteLocal: string[]; deleteRemote: string[] } {
  const local = new Set(input.localIds);
  const remote = new Set(input.remoteIds);
  const localChanged = new Set(input.localChanged);
  const remoteChanged = new Set(input.remoteChanged);
  const deleteLocal: string[] = [];
  const deleteRemote: string[] = [];
  for (const id of new Set(input.known)) {
    const here = local.has(id);
    const there = remote.has(id);
    if (here && !there && !localChanged.has(id)) deleteLocal.push(id);
    if (!here && there && !remoteChanged.has(id)) deleteRemote.push(id);
  }
  return { deleteLocal, deleteRemote };
}

/**
 * JSON with object keys sorted, so two objects with the same content always give
 * the same text. Postgres `jsonb` does not keep key order, so a plain
 * JSON.stringify would see "changes" that are not real.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
}

/** Same content? (Used to skip rewriting rows that only came back as an echo of our own upload.) */
export function sameContent(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}
