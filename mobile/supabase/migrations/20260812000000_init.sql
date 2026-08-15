-- Interval — Supabase schema.
--
-- The phone is the source of truth; this is a replica it merges with. Every
-- table is scoped by user_id and closed behind row level security, and every
-- row carries updated_at because the merge rule is "latest timestamp wins".
--
-- Apply by pasting the whole file into the SQL editor, or with
-- `supabase db push`. Safe to run more than once.
--
-- Row ids are minted on the device, so no uuid extension is needed here.

-- ---------------------------------------------------------------- profiles --

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A trigger on auth.users needs ownership of that table, which a hosted
-- project may withhold. Profiles are a convenience — the app reads the address
-- from the session — so a refusal here must not stop the rest of the schema
-- being created.
do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
exception
  when insufficient_privilege then
    raise notice 'skipped the auth.users trigger: %', sqlerrm;
end;
$$;

-- ------------------------------------------------------------------ skills --

create table if not exists public.skills (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  genre text not null check (genre in ('reasoning', 'conceptual', 'memorization', 'language', 'physical')),
  physical_kind text check (physical_kind in ('closed', 'open')),
  hue_index integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ topics --

create table if not exists public.topics (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  skill_id uuid not null references public.skills on delete cascade,
  title text not null,
  sub_skill text,
  state text not null default 'new' check (state in ('new', 'learning', 'stable', 'paused')),
  interval_days real not null default 1,
  ease real not null default 2.5,
  -- Rung on the genre's curve.
  repetition integer not null default 0,
  -- Signed: +n consecutive OKs (three is a plateau), -n hard/failed (three is a weak point).
  streak integer not null default 0,
  -- Permanent interval multiplier from weak points, floored at 0.4.
  penalty real not null default 1,
  -- Index into the practice-format ladder; escalates one rung per plateau.
  format_rung integer not null default 0,
  due_on date not null,
  last_reviewed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists topics_user_due on public.topics (user_id, due_on);
create index if not exists topics_skill on public.topics (skill_id);

-- ----------------------------------------------------------------- reviews --

create table if not exists public.reviews (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  topic_id uuid not null references public.topics on delete cascade,
  rating text not null check (rating in ('failed', 'hard', 'ok', 'easy', 'pushed')),
  felt_shaky boolean not null default false,
  rated_at timestamptz not null default now(),
  prev_interval real not null,
  next_interval real not null,
  updated_at timestamptz not null default now()
);

create index if not exists reviews_user_rated on public.reviews (user_id, rated_at);
create index if not exists reviews_topic on public.reviews (topic_id);

-- ------------------------------------------------------------- log_entries --

create table if not exists public.log_entries (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  skill_id uuid not null references public.skills on delete cascade,
  topic_id uuid references public.topics on delete set null,
  sub_skill text,
  studied_on date not null,
  flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists log_entries_user_day on public.log_entries (user_id, studied_on);

-- ------------------------------------------------------------------- pairs --
-- Two things you mix up, held apart while either is shaky.

create table if not exists public.pairs (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  topic_a uuid not null references public.topics on delete cascade,
  topic_b uuid not null references public.topics on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- settings --

create table if not exists public.settings (
  user_id uuid primary key references auth.users on delete cascade,
  -- Capacity is counted in things due, never in minutes.
  daily_capacity integer not null default 8,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  pre_deadline_days integer not null default 21,
  exam_date date,
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- privileges --
-- RLS decides *which rows* a role may touch; it does not grant access to the
-- table in the first place. Without these, every signed-in request fails with
-- "permission denied for table skills" no matter how correct the policies are.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- --------------------------------------------------------------------- RLS --
-- Nothing is readable across users. The client only ever sends its own rows,
-- but the database is what makes that true.

alter table public.profiles    enable row level security;
alter table public.skills      enable row level security;
alter table public.topics      enable row level security;
alter table public.reviews     enable row level security;
alter table public.log_entries enable row level security;
alter table public.pairs       enable row level security;
alter table public.settings    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['skills', 'topics', 'reviews', 'log_entries', 'pairs'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end;
$$;

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ------------------------------------------------------------ account wipe --
-- "Removes the copy on the server within 30 days." Deleting the auth user
-- cascades through every table above.

create table if not exists public.deletion_requests (
  user_id uuid primary key references auth.users on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.deletion_requests enable row level security;

drop policy if exists "own deletion request" on public.deletion_requests;
create policy "own deletion request" on public.deletion_requests for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.deletion_requests (user_id)
  values (auth.uid())
  on conflict (user_id) do update set requested_at = now();
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;
