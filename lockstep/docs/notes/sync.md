# Cloud sync notes (optional, Tier 3)

LOCKSTEP is local-first. Dexie (IndexedDB) on the device is the source of truth, and the app works fully as a guest. Signing in adds one thing: keeping your devices in step through Supabase. If the two env vars are missing, Settings says that cloud sync isn't set up and shows no sign-in controls.

## Files

| Path | What it does |
|---|---|
| `supabase/migrations/0001_lockstep.sql` | Cloud tables that mirror Dexie, the touch trigger, grants and RLS policies |
| `src/lib/sync/client.ts` | `cloudConfigured`, and `getSupabase()`, which creates the client the first time it is used and only when both env vars are set |
| `src/lib/sync/merge.ts` | Pure logic: `mergeRows` (last write wins), `planDeletions`, `sameContent` |
| `src/lib/sync/sync.ts` | `signInWithEmail`, `signOut`, `useSession`, `syncNow`, and the Dexie ⇄ cloud row mapping |
| `src/features/settings/CloudSync.tsx` | The Settings section, which has three states: not configured, signed out, signed in |
| `tests/unit/rls.test.ts` | Runs the real migration in PGlite and proves users can't read or write each other's rows |
| `tests/unit/sync.test.ts` | Tests the merge, deletions, row mapping and error sentences |

## How one sync works

`syncNow()` handles the tables in parent-first order: goals → milestones → tasks → progress_logs → wallpapers → ai_runs. For each table it does five things:

1. **Pull.** It asks the cloud for rows whose `sync_seq` is greater than the highest number it has already pulled. `sync_seq` is a server change number that the trigger hands out on every insert or update. It comes from one counter, so no device clock is involved and paging never skips rows. The device also fetches the list of ids in the cloud, which step 3 uses.
2. **Merge.** It merges the pulled rows with the local rows changed since this device's last push (their `updated_at` is later than `sync:lastPushedAt`). It also includes local rows the cloud has never had, for example a row brought back with Undo. For each row, the later `updated_at` wins, and a tie goes to the cloud copy.
3. **Deletions.** The app really deletes rows; it has no "deleted" flag. So sync remembers which ids both sides had after the last sync (`sync:known`). If one side has lost an id since then, sync deletes it on the other side too. The exception is when the other side has edited that row since: then the edit wins and the row comes back. When a goal is deleted, its plan goes with it. In the cloud this happens through `on delete cascade`; on the device, sync deletes the children the same way `deleteGoal` does.
4. **Write locally** in one Dexie transaction. A row that came back unchanged (an echo of our own upload) is skipped. A row the user edited while the sync was running is kept and uploaded next time.
5. **Upload.** Cloud deletions run first, then upserts in batches of 200. A child row whose parent isn't in the cloud is skipped instead of failing the whole sync.

Sync saves its progress after each table, so a failure partway through loses nothing. It keeps this state in Dexie `kv`:

| Key | What it holds |
|---|---|
| `sync:account` | `{ id, email }` of the account this device's data belongs to |
| `sync:lastPulledSeq` | The highest `sync_seq` pulled, per table |
| `sync:lastPushedAt` | When this device last uploaded, per table |
| `sync:known` | The ids that both sides had after the last sync, per table |
| `sync:lastSyncedAt` | When the last sync finished. The UI shows it |

**Why `sync:lastPulledSeq` and not a `lastPulledAt` time?** A device that was offline uploads edits stamped with older times. A cursor based on time would skip those edits for good. Timestamps can also tie at page boundaries. A server counter has neither problem. `updated_at` is still the device's edit time and is still what decides last write wins.

Field mapping:
- Dexie `order` becomes `sort_order`, because `order` is a reserved word in SQL.
- `intake`, `plan_meta`, `working_days` and `design_json` are stored as jsonb.
- On ai_runs, `created_at` maps to `at` and also serves as `updated_at`, because a run never changes.
- Upload sets `user_id` on goals and ai_runs, then sets it on the local copies too, without touching `updated_at`.

`syncNow()` never throws. It returns `{ ok: true, total, tables }` with `pulled`/`pushed`/`deleted` counts, or `{ ok: false, message }` with a plain sentence. Raw database errors never reach the user. A second call while a sync is running gets the same promise. Web Locks stop two tabs from syncing at the same time.

## Setup (developer)

1. Create a Supabase project.
2. In the **SQL Editor**, run `supabase/migrations/0001_lockstep.sql`, or use `supabase db push` with the CLI. If you already created `ai_runs` from `docs/notes/server.md`, run `drop table public.ai_runs;` first. It only holds logs, and the new table keeps every column the server writes.
3. Go to **Authentication → Sign In / Providers** and check that **Email** is enabled. Magic links are on by default.
4. Go to **Authentication → URL Configuration**:
   - Set **Site URL** to your deployed app, for example `https://lockstep.example.app`.
   - Add these **Redirect URLs**: `http://localhost:5173/settings`, `http://localhost:4173/settings` and `https://<your-domain>/settings`. The magic link returns to the page where the user asked for it, which is Settings.
5. Go to **Project Settings → API** and copy the Project URL and the anon (public) key into `.env`:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
   Then restart `npm run dev` or rebuild. Vite bakes `VITE_*` values into the bundle at build time. They are public by design, because RLS protects the data. Never put the service-role key in a `VITE_*` variable.
6. Optional: `SUPABASE_SERVICE_ROLE_KEY` (server-only) turns on the server's `ai_runs` logging described in `server.md`. Those rows have `user_id = null`, so users never see them.
7. For real users, set up **custom SMTP** (Authentication → Emails). Supabase's built-in sender is only for testing and allows a few emails per hour.

## Security model

- RLS is on for **every** table. Each table has separate select, insert, update and delete policies for `authenticated`.
- goals and ai_runs: `user_id = auth.uid()`.
- milestones, tasks, progress_logs and wallpapers: `exists (select 1 from goals g where g.id = goal_id and g.user_id = auth.uid())`. Updates check this both before and after the change, so a row can't be moved under someone else's goal.
- `anon` gets **no** table privileges at all, because guests never talk to the database.
- These fields never leave the device: wallpaper `share_secret`, and with it `share_token`, `share_url` and `revoked_at`. Only the device that holds the secret can update or revoke a Living Wallpaper link. If another device showed a "Revoke" button, that button would not really work. The `thumb` data URL also stays on the device.
- `tests/unit/rls.test.ts` proves all of this against the real migration:
  - cross-user selects return 0 rows;
  - updates and deletes affect 0 rows;
  - inserts under another user's goal, goals created for someone else, moving a row and id-collision upserts are rejected;
  - anon gets "permission denied";
  - the owner can still do everything to their own rows.

## Limits

- **Last write wins, per row.** If two devices edit the same row between syncs, the edit with the later `updated_at` wins and the other is lost. Fields are not merged. A device whose clock is badly wrong can lose edits.
- **No realtime.** Sync runs only when you tap "Sync now", on each device. There is no background or automatic sync yet.
- **Edits beat deletions, but only per row.** If one device deletes a goal while another adds a milestone to it, the goal deletion removes that milestone too.
- **One account per device.** If this device's data was synced with account A, signing in as B refuses to sync and explains why. To switch, export your data, use "Delete all data", then sign in as B. "Delete all data" clears the device and signs you out, but the cloud copy stays: signing in again and syncing brings it back. To remove cloud data, delete the goals while signed in and then sync, or delete the user in Supabase. That cascades to all their rows.
- **Device-only data:**
  - Living Wallpaper links
  - thumbnails
  - uploaded photo backgrounds (`idb:` images; other devices draw the theme background instead)
  - settings and UI preferences
  - everything else in `kv`
- **Writes that don't bump `updated_at`** sync only with that row's next real edit. A few app writes do this: `ReviewPage` resetting `status`, `normalizeOrder`, and the reorder inside `applyReschedule`.
- **Scale.** Each sync lists every id per table, which is used to detect deletions. That's fine for one person's data (thousands of rows). Keep Supabase's "Max rows" at 500 or more; the default is 1000. Child-table policies look up the goal for each row. If this ever grows large, add `user_id` to the child tables.
- **A rare race.** If two devices upload at the same moment that a third device pulls, the third device can miss one of those rows until it next changes.
- **Not yet run against a live Supabase project**, because the network was blocked while this was built. The SQL and the full `syncNow` flow were checked in PGlite: the real migration with RLS, plus a stand-in for supabase-js that returns PostgREST-shaped JSON. Two devices were simulated, covering first upload, no-op re-sync, download on a new device, edits, conflicts, deletions in both directions, Undo, edit-beats-delete, goal cascade, account mixing and a missing migration.
