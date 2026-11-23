-- ─────────────────────────────────────────────────────────────────────────────
-- LOCKSTEP cloud schema (optional Tier 3 sync).
--
-- The app is local-first: the real database lives in the browser (Dexie). These
-- tables are a MIRROR of the Dexie tables so a signed-in user can sync devices.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
--
-- Plain-English guide to what is here:
--   * Every table has Row Level Security (RLS) ON, with separate
--     select / insert / update / delete policies for the `authenticated` role.
--     The `anon` key in the browser is public, so RLS is the ONLY thing that
--     stops one user from reading another user's rows.
--   * goals and ai_runs are owned directly: `user_id = auth.uid()`.
--   * milestones, tasks, progress_logs and wallpapers are owned THROUGH their goal:
--     you may touch a child row only if its goal is yours.
--   * `updated_at` is the CLIENT's edit time (used for last-write-wins).
--   * `sync_seq` is a SERVER change number: every insert/update takes the next
--     number from one counter, so a device can ask "what changed after #N?"
--     without trusting any device's clock.
--   * Device-only fields are deliberately NOT here: wallpaper `share_secret`
--     (and the rest of the Living Wallpaper link fields) and the `thumb` image.
--
-- If you created `ai_runs` earlier from docs/notes/server.md, drop it first:
--   drop table if exists public.ai_runs;
-- (it only holds call logs). This version keeps every column the server writes.
-- ─────────────────────────────────────────────────────────────────────────────

-- One counter for all synced tables. Gaps are normal and harmless.
create sequence if not exists public.lockstep_sync_seq;

-- Runs before every insert/update on the synced tables.
create or replace function public.lockstep_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- "Touch" updated_at: if a row's content changed but updated_at did not move
  -- (for example an edit in the Supabase table editor), stamp it now so that
  -- edit wins on every device. The app always moves updated_at itself, so its
  -- own writes keep the device's timestamp untouched.
  if tg_op = 'UPDATE' and new.updated_at = old.updated_at and new is distinct from old then
    new.updated_at := now();
  end if;
  -- Hand out the next change number. Devices pull "rows with sync_seq > N".
  new.sync_seq := nextval('public.lockstep_sync_seq');
  return new;
end;
$$;

-- ───────────────────────────── goals ─────────────────────────────
create table if not exists public.goals (
  id            text primary key,              -- generated on the device (uuid)
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null,
  deadline_utc  timestamptz not null,
  timezone      text not null,
  start_utc     timestamptz not null,
  status        text not null check (status in ('planning', 'review', 'active', 'completed', 'archived')),
  pace_style    text not null,
  hours_per_day double precision not null,
  working_days  jsonb not null default '[]'::jsonb,   -- e.g. [1,2,3,4,5]
  constraints   text not null default '',
  level         text not null,
  intake        jsonb not null,                      -- what the user typed in the wizard
  dst_note      text,
  plan_meta     jsonb,                               -- feasibility, checks, risks…
  approved_at   timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sync_seq      bigint not null default 0
);
create index if not exists goals_user_seq_idx on public.goals (user_id, sync_seq);
create index if not exists goals_user_updated_idx on public.goals (user_id, updated_at);

-- ───────────────────────────── milestones ─────────────────────────────
create table if not exists public.milestones (
  id              text primary key,
  goal_id         text not null references public.goals (id) on delete cascade,
  title           text not null,
  description     text not null default '',
  target_date     date not null,                     -- YYYY-MM-DD in the goal's zone
  estimated_hours double precision not null,
  difficulty      text not null,
  sort_order      integer not null default 0,        -- Dexie `order` (a reserved word in SQL)
  source          text not null check (source in ('ai', 'user')),
  edited          boolean not null default false,
  status          text not null check (status in ('pending', 'approved', 'completed')),
  approved_at     timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sync_seq        bigint not null default 0
);
create index if not exists milestones_goal_idx on public.milestones (goal_id);
create index if not exists milestones_seq_idx on public.milestones (sync_seq);
create index if not exists milestones_updated_idx on public.milestones (updated_at);

-- ───────────────────────────── tasks ─────────────────────────────
create table if not exists public.tasks (
  id                text primary key,
  milestone_id      text not null references public.milestones (id) on delete cascade,
  goal_id           text not null references public.goals (id) on delete cascade,
  title             text not null,
  -- double precision (not integer) so an odd value typed on a device never blocks a sync.
  estimated_minutes double precision not null,
  sort_order        integer not null default 0,
  source            text not null check (source in ('ai', 'user')),
  edited            boolean not null default false,
  done_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  sync_seq          bigint not null default 0
);
create index if not exists tasks_goal_idx on public.tasks (goal_id);
create index if not exists tasks_milestone_idx on public.tasks (milestone_id);
create index if not exists tasks_seq_idx on public.tasks (sync_seq);
create index if not exists tasks_updated_idx on public.tasks (updated_at);

-- ───────────────────────────── progress_logs ─────────────────────────────
create table if not exists public.progress_logs (
  id         text primary key,
  goal_id    text not null references public.goals (id) on delete cascade,
  date       date not null,                          -- YYYY-MM-DD in the goal's zone
  minutes    double precision not null,
  note       text not null default '',
  task_id    text,                                   -- soft link: no FK, a log may outlive its task
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_seq   bigint not null default 0
);
create index if not exists progress_logs_goal_idx on public.progress_logs (goal_id);
create index if not exists progress_logs_seq_idx on public.progress_logs (sync_seq);
create index if not exists progress_logs_updated_idx on public.progress_logs (updated_at);

-- ───────────────────────────── wallpapers ─────────────────────────────
-- No share_secret / share_token / share_url / revoked_at / thumb here on purpose:
-- a Living Wallpaper link can only be updated or revoked by the device that holds
-- its secret, so those fields stay on that device. The thumbnail is a big data URL
-- that each device can redraw.
create table if not exists public.wallpapers (
  id            text primary key,
  goal_id       text not null references public.goals (id) on delete cascade,
  name          text not null,
  design_json   jsonb not null,
  device_preset text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sync_seq      bigint not null default 0
);
create index if not exists wallpapers_goal_idx on public.wallpapers (goal_id);
create index if not exists wallpapers_seq_idx on public.wallpapers (sync_seq);
create index if not exists wallpapers_updated_idx on public.wallpapers (updated_at);

-- ───────────────────────────── ai_runs ─────────────────────────────
-- Extends the table from docs/notes/server.md. The server still inserts
-- { kind, model, latency_ms, ok, tokens, at } with the service-role key: `id`
-- gets a default, `user_id` stays null, and RLS hides those rows from users.
-- Devices upload their own runs with their own id and user_id.
create table if not exists public.ai_runs (
  id         text primary key default gen_random_uuid()::text,
  user_id    uuid default auth.uid() references auth.users (id) on delete cascade,
  goal_id    text,                                   -- no FK: logs outlive goals
  kind       text not null,                          -- plan | repair | coach | motivation | insight | background
  model      text not null,
  latency_ms integer not null,
  ok         boolean not null,
  tokens     integer,
  at         timestamptz not null default now(),     -- when the call finished
  updated_at timestamptz not null default now(),
  sync_seq   bigint not null default 0
);
create index if not exists ai_runs_user_seq_idx on public.ai_runs (user_id, sync_seq);
create index if not exists ai_runs_user_updated_idx on public.ai_runs (user_id, updated_at);

-- ───────────────────────────── triggers ─────────────────────────────
drop trigger if exists goals_touch on public.goals;
create trigger goals_touch before insert or update on public.goals
  for each row execute function public.lockstep_touch();
drop trigger if exists milestones_touch on public.milestones;
create trigger milestones_touch before insert or update on public.milestones
  for each row execute function public.lockstep_touch();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before insert or update on public.tasks
  for each row execute function public.lockstep_touch();
drop trigger if exists progress_logs_touch on public.progress_logs;
create trigger progress_logs_touch before insert or update on public.progress_logs
  for each row execute function public.lockstep_touch();
drop trigger if exists wallpapers_touch on public.wallpapers;
create trigger wallpapers_touch before insert or update on public.wallpapers
  for each row execute function public.lockstep_touch();
drop trigger if exists ai_runs_touch on public.ai_runs;
create trigger ai_runs_touch before insert or update on public.ai_runs
  for each row execute function public.lockstep_touch();

-- ───────────────────────────── privileges ─────────────────────────────
-- Signed-in users may use these tables (RLS then limits them to their own rows).
-- Guests (`anon`) never talk to the database, so they get nothing at all.
grant select, insert, update, delete on table
  public.goals, public.milestones, public.tasks, public.progress_logs, public.wallpapers, public.ai_runs
  to authenticated;
grant select, insert, update, delete on table
  public.goals, public.milestones, public.tasks, public.progress_logs, public.wallpapers, public.ai_runs
  to service_role;
revoke all on table
  public.goals, public.milestones, public.tasks, public.progress_logs, public.wallpapers, public.ai_runs
  from anon;
-- The trigger calls nextval() as the user who is writing.
grant usage on sequence public.lockstep_sync_seq to authenticated, service_role;
revoke all on sequence public.lockstep_sync_seq from anon;

-- ───────────────────────────── row level security ─────────────────────────────
-- `(select auth.uid())` instead of `auth.uid()`: same meaning, but Postgres
-- evaluates it once per query instead of once per row (Supabase's advice).
alter table public.goals         enable row level security;
alter table public.milestones    enable row level security;
alter table public.tasks         enable row level security;
alter table public.progress_logs enable row level security;
alter table public.wallpapers    enable row level security;
alter table public.ai_runs       enable row level security;

-- goals: owned directly.
drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own" on public.goals for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));   -- can't hand a goal to someone else
drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own" on public.goals for delete to authenticated
  using (user_id = (select auth.uid()));

-- milestones: owned through their goal.
drop policy if exists "milestones_select_own" on public.milestones;
create policy "milestones_select_own" on public.milestones for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "milestones_insert_own" on public.milestones;
create policy "milestones_insert_own" on public.milestones for insert to authenticated
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "milestones_update_own" on public.milestones;
create policy "milestones_update_own" on public.milestones for update to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())))
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "milestones_delete_own" on public.milestones;
create policy "milestones_delete_own" on public.milestones for delete to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));

-- tasks: owned through their goal.
drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks for insert to authenticated
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks for update to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())))
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks for delete to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));

-- progress_logs: owned through their goal.
drop policy if exists "progress_logs_select_own" on public.progress_logs;
create policy "progress_logs_select_own" on public.progress_logs for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "progress_logs_insert_own" on public.progress_logs;
create policy "progress_logs_insert_own" on public.progress_logs for insert to authenticated
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "progress_logs_update_own" on public.progress_logs;
create policy "progress_logs_update_own" on public.progress_logs for update to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())))
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "progress_logs_delete_own" on public.progress_logs;
create policy "progress_logs_delete_own" on public.progress_logs for delete to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));

-- wallpapers: owned through their goal.
drop policy if exists "wallpapers_select_own" on public.wallpapers;
create policy "wallpapers_select_own" on public.wallpapers for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "wallpapers_insert_own" on public.wallpapers;
create policy "wallpapers_insert_own" on public.wallpapers for insert to authenticated
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "wallpapers_update_own" on public.wallpapers;
create policy "wallpapers_update_own" on public.wallpapers for update to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())))
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
drop policy if exists "wallpapers_delete_own" on public.wallpapers;
create policy "wallpapers_delete_own" on public.wallpapers for delete to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));

-- ai_runs: owned directly. Server rows (user_id null) match nobody, so only
-- the service role (which bypasses RLS) can see them.
drop policy if exists "ai_runs_select_own" on public.ai_runs;
create policy "ai_runs_select_own" on public.ai_runs for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "ai_runs_insert_own" on public.ai_runs;
create policy "ai_runs_insert_own" on public.ai_runs for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "ai_runs_update_own" on public.ai_runs;
create policy "ai_runs_update_own" on public.ai_runs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "ai_runs_delete_own" on public.ai_runs;
create policy "ai_runs_delete_own" on public.ai_runs for delete to authenticated
  using (user_id = (select auth.uid()));
