/**
 * Proves the Supabase Row Level Security policies in supabase/migrations/0001_lockstep.sql
 * really keep users apart. PGlite is a full Postgres compiled to WebAssembly, so the
 * REAL migration runs here, unchanged, and Postgres itself enforces the policies.
 *
 * How we pretend to be a Supabase user: Supabase's API runs each request as the role
 * `authenticated` (or `anon` without a login) and puts the user's id in the setting
 * `request.jwt.claim.sub`, which `auth.uid()` reads. We do exactly that per query.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite, type Results } from '@electric-sql/pglite';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

/** The few Supabase pieces the migration relies on (the real project already has them). */
const SUPABASE_SHIM = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase grants new public tables to these roles by default; RLS does the real work.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const migration = readFileSync(
  new URL('../../supabase/migrations/0001_lockstep.sql', import.meta.url),
  'utf8',
);
const TABLES = ['goals', 'milestones', 'tasks', 'progress_logs', 'wallpapers', 'ai_runs'] as const;

let pg: PGlite;

/** Run one statement as a signed-in user (or as a guest when userId is null). */
async function as<T = Record<string, unknown>>(
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<Results<T>> {
  return pg.transaction(async (tx) => {
    // `set local` lasts only for this transaction, so every call starts clean.
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    return tx.query<T>(sql, params);
  });
}

const asServer = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  pg.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return tx.query<T>(sql, params);
  });

/** One goal with one of every child row, inserted as the database owner (bypasses RLS). */
async function seed(user: string, tag: string) {
  await pg.query('insert into auth.users (id) values ($1)', [user]);
  await pg.query(
    `insert into public.goals (id, user_id, title, deadline_utc, timezone, start_utc, status, pace_style, hours_per_day, working_days, level, intake)
     values ($1, $2, $3, now() + interval '30 days', 'UTC', now(), 'active', 'Steady', 2, '[1,2,3,4,5]', 'Beginner', '{"goal":"x"}')`,
    [`g${tag}`, user, `Goal ${tag}`],
  );
  await pg.query(
    `insert into public.milestones (id, goal_id, title, target_date, estimated_hours, difficulty, sort_order, source, status)
     values ($1, $2, $3, '2026-12-01', 4, 'Medium', 0, 'ai', 'approved')`,
    [`m${tag}`, `g${tag}`, `Milestone ${tag}`],
  );
  await pg.query(
    `insert into public.tasks (id, milestone_id, goal_id, title, estimated_minutes, source) values ($1, $2, $3, 'Task', 30, 'ai')`,
    [`t${tag}`, `m${tag}`, `g${tag}`],
  );
  await pg.query(
    `insert into public.progress_logs (id, goal_id, date, minutes) values ($1, $2, '2026-11-23', 25)`,
    [`l${tag}`, `g${tag}`],
  );
  await pg.query(
    `insert into public.wallpapers (id, goal_id, name, design_json, device_preset) values ($1, $2, 'Wall', '{}', 'iphone-15')`,
    [`w${tag}`, `g${tag}`],
  );
  await pg.query(
    `insert into public.ai_runs (id, user_id, goal_id, kind, model, latency_ms, ok) values ($1, $2, $3, 'plan', 'm', 900, true)`,
    [`r${tag}`, user, `g${tag}`],
  );
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(SUPABASE_SHIM);
  await pg.exec(migration); // the real file, unchanged
  await seed(A, 'A');
  await seed(B, 'B');
});

afterAll(async () => {
  await pg.close();
});

describe('migration shape', () => {
  it('turns RLS on for every synced table and has 4 policies each', async () => {
    const r = await pg.query<{ relname: string; relrowsecurity: boolean; policies: number }>(
      `select c.relname, c.relrowsecurity, (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
    );
    expect(r.rows.map((x) => x.relname).sort()).toEqual([...TABLES].sort());
    for (const row of r.rows) {
      expect(row.relrowsecurity, row.relname).toBe(true);
      expect(row.policies, row.relname).toBe(4);
    }
  });

  it('keeps share_secret (and the thumbnail) out of the cloud', async () => {
    const r = await pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'wallpapers'`,
    );
    const cols = r.rows.map((x) => x.column_name);
    expect(cols).not.toContain('share_secret');
    expect(cols).not.toContain('thumb');
  });
});

describe('row level security', () => {
  it("user A sees only A's goals and children", async () => {
    for (const t of TABLES) {
      const r = await as<{ id: string }>(A, `select id from public.${t}`);
      expect(
        r.rows.map((x) => x.id),
        t,
      ).toHaveLength(1);
      expect(r.rows[0]?.id.endsWith('A'), t).toBe(true);
    }
  });

  it("selecting B's milestone by id returns 0 rows", async () => {
    const r = await as(A, `select * from public.milestones where id = 'mB'`);
    expect(r.rows).toHaveLength(0);
  });

  it("updating B's rows affects 0 rows", async () => {
    for (const t of TABLES) {
      const col =
        t === 'ai_runs'
          ? 'model'
          : t === 'progress_logs'
            ? 'note'
            : t === 'goals' || t === 'milestones' || t === 'tasks'
              ? 'title'
              : 'name';
      const r = await as(A, `update public.${t} set ${col} = 'hacked' where id like '%B'`);
      expect(r.affectedRows, t).toBe(0);
    }
    const check = await pg.query<{ title: string }>(`select title from public.goals where id = 'gB'`);
    expect(check.rows[0]?.title).toBe('Goal B');
  });

  it("deleting B's rows affects 0 rows", async () => {
    for (const t of [...TABLES].reverse()) {
      const r = await as(A, `delete from public.${t} where id like '%B'`);
      expect(r.affectedRows, t).toBe(0);
    }
    const left = await pg.query<{ n: number }>(
      `select count(*)::int as n from public.tasks where goal_id = 'gB'`,
    );
    expect(left.rows[0]?.n).toBe(1);
  });

  it("rejects inserting a milestone under B's goal", async () => {
    await expect(
      as(
        A,
        `insert into public.milestones (id, goal_id, title, target_date, estimated_hours, difficulty, source, status)
             values ('evil', 'gB', 'x', '2026-12-01', 1, 'Easy', 'user', 'pending')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('rejects creating a goal owned by someone else', async () => {
    await expect(
      as(
        A,
        `insert into public.goals (id, user_id, title, deadline_utc, timezone, start_utc, status, pace_style, hours_per_day, level, intake)
             values ('gEvil', $1, 'x', now(), 'UTC', now(), 'active', 'Steady', 1, 'Beginner', '{}')`,
        [B],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects moving A's own milestone under B's goal", async () => {
    await expect(as(A, `update public.milestones set goal_id = 'gB' where id = 'mA'`)).rejects.toThrow(
      /row-level security/,
    );
  });

  it("rejects an upsert that collides with B's id (cannot overwrite B)", async () => {
    await expect(
      as(
        A,
        `insert into public.progress_logs (id, goal_id, date, minutes) values ('lB', 'gA', '2026-11-23', 5)
             on conflict (id) do update set minutes = excluded.minutes`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('a guest (anon) sees nothing: no table access at all', async () => {
    for (const t of TABLES) {
      await expect(as(null, `select id from public.${t}`), t).rejects.toThrow(/permission denied/);
    }
  });

  it('a signed-in user who owns nothing sees nothing', async () => {
    const r = await as(A.replace('a', 'c'), 'select id from public.goals');
    expect(r.rows).toHaveLength(0);
  });

  it('A can still do everything to A’s own rows (policies are not just "deny all")', async () => {
    await as(
      A,
      `insert into public.milestones (id, goal_id, title, target_date, estimated_hours, difficulty, source, status)
                 values ('mA2', 'gA', 'Mine', '2026-12-02', 1, 'Easy', 'user', 'pending')
                 on conflict (id) do update set title = excluded.title`,
    );
    expect(
      (await as(A, `update public.milestones set title = 'Renamed' where id = 'mA2'`)).affectedRows,
    ).toBe(1);
    expect((await as(A, `delete from public.milestones where id = 'mA2'`)).affectedRows).toBe(1);
  });
});

describe('server logging and the touch trigger', () => {
  it('the server can still log an ai_run the old way, and users never see it', async () => {
    await asServer(
      `insert into public.ai_runs (kind, model, latency_ms, ok, tokens, at) values ('coach', 'gemini', 1200, true, 99, now())`,
    );
    const all = await pg.query<{ n: number }>(
      `select count(*)::int as n from public.ai_runs where user_id is null`,
    );
    expect(all.rows[0]?.n).toBe(1);
    const mine = await as<{ id: string }>(A, 'select id from public.ai_runs');
    expect(mine.rows.map((x) => x.id)).toEqual(['rA']);
  });

  it('gives every write a new, larger sync_seq and keeps the device timestamp', async () => {
    const before = await as<{ sync_seq: number }>(A, `select sync_seq from public.tasks where id = 'tA'`);
    await as(
      A,
      `update public.tasks set title = 'Edited', updated_at = '2020-01-01T10:00:00.000Z' where id = 'tA'`,
    );
    const after = await as<{ sync_seq: number; updated_at: Date }>(
      A,
      `select sync_seq, updated_at from public.tasks where id = 'tA'`,
    );
    expect(Number(after.rows[0]?.sync_seq)).toBeGreaterThan(Number(before.rows[0]?.sync_seq));
    expect(after.rows[0]?.updated_at.toISOString()).toBe('2020-01-01T10:00:00.000Z');
  });

  it('touches updated_at when content changes but updated_at does not (e.g. a dashboard edit)', async () => {
    await as(A, `update public.tasks set title = 'Dashboard edit' where id = 'tA'`);
    const r = await as<{ updated_at: Date }>(A, `select updated_at from public.tasks where id = 'tA'`);
    expect(r.rows[0]?.updated_at.getTime()).toBeGreaterThan(Date.parse('2020-01-01T10:00:00.000Z'));
  });
});
