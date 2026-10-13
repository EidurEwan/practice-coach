-- Interval — sync, second schema.
--
-- The first schema mirrored the device's five tables, and the app upserted
-- into them and read them back whole. Walking two devices through it turned up
-- failures that could not be patched in place:
--
--  * Nothing recorded a deletion. An undone rating or a deleted skill was still
--    on the server, so the next sync put it back on every device.
--  * The only way to learn what had changed was to download every row — and
--    PostgREST stops at max_rows (1000), so a new phone received the first
--    thousand ratings and silently no more.
--  * Row ids were primary keys across all accounts, so a phone that had synced
--    to one account was refused by the next.
--  * Foreign keys between rows meant one orphan stopped every later sync.
--
-- What replaces it is one table holding every record as a document, keyed per
-- account, with a tombstone flag and a position in a feed (`seq`). Clients
-- read the feed from where they left off and write only through `sync_push`,
-- which applies "latest timestamp wins" itself, so the rule cannot be skipped
-- by a client that forgets it.
--
-- Safe to run more than once. Rows in the first schema's tables are copied
-- across before those tables are dropped.

-- ------------------------------------------------------------------- feed --

-- One sequence for every account. A client only ever reads its own rows, and
-- `sync_push` holds a per-account lock while it draws numbers, so within one
-- account the numbers are handed out in commit order — which is what makes
-- "everything after seq N" a complete answer.
create sequence if not exists public.sync_seq;

create table if not exists public.sync_rows (
  user_id uuid not null references auth.users on delete cascade,
  collection text not null
    check (collection in ('skills', 'topics', 'reviews', 'log_entries', 'pairs', 'settings')),
  id text not null check (length(id) between 1 and 64),
  -- The record exactly as the device wrote it. Null once deleted.
  data jsonb check (data is null or (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 16384)),
  deleted boolean not null default false,
  -- The device's timestamp for this version; the merge compares these.
  updated_at timestamptz not null,
  -- Where this version sits in the account's feed. Bumped on every change.
  seq bigint not null,
  primary key (user_id, collection, id),
  check (deleted or data is not null)
);

create index if not exists sync_rows_feed on public.sync_rows (user_id, seq);

-- ------------------------------------------------------------- privileges --
-- Readable by its owner, writable only through sync_push. The first schema
-- set default privileges that grant writes on every new table, so they are
-- taken back explicitly here rather than assumed absent.

alter table public.sync_rows enable row level security;

revoke all on public.sync_rows from anon, authenticated;
grant select on public.sync_rows to authenticated;

drop policy if exists "own rows" on public.sync_rows;
create policy "own rows" on public.sync_rows for select to authenticated
  using (auth.uid() = user_id);

-- -------------------------------------------------------------- sync_push --
-- Applies a batch of changes from one device and reports what it refused.
--
--   changes  [{ collection, id, updated_at, deleted, data }, …]  at most 500
--   since    the feed position the device has applied everything up to
--
-- Returns { rejected, cursor, behind, now }:
--
--   rejected  the server's current copy of every change it did not take, so
--             the device can adopt it instead of diverging quietly
--   behind    whether another device wrote after `since` — if so, the device
--             still has to read the feed
--   cursor    if not behind, the position just past this batch's own writes,
--             so the device need not download its own changes back
--   now       the server's clock, which devices use to keep their own honest
--
-- The rule, per row:
--   * new to the server: stored
--   * deleted on the server: stays deleted. A deletion is final — an edit made
--     elsewhere before it was known about must not bring back one topic of a
--     skill whose other topics are gone.
--   * a deletion arriving: applied
--   * a newer edit: stored
--   * an older edit, or a different edit with the same timestamp: refused, and
--     the server's copy sent back. Ties go to the server so that both sides
--     settle on the same copy.
--   * the very same edit again: nothing to do (retries are harmless)

create or replace function public.sync_push(changes jsonb, since bigint default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  change jsonb;
  coll text;
  rid text;
  at timestamptz;
  del boolean;
  body jsonb;
  cur public.sync_rows%rowtype;
  rejected jsonb := '[]'::jsonb;
  next_seq bigint;
  first_seq bigint;
  last_seq bigint;
  is_behind boolean;
begin
  if me is null then
    raise exception 'sync_push needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(changes) is distinct from 'array' then
    raise exception 'changes must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(changes) > 500 then
    raise exception 'at most 500 changes per call' using errcode = '54000';
  end if;

  -- One writer per account at a time, held until commit. This is what keeps
  -- an account's seq numbers in commit order; without it a reader could see
  -- seq 11 before seq 10 had committed, move past 10, and never see it.
  perform pg_advisory_xact_lock(hashtextextended('interval-sync:' || me::text, 0));

  for change in select value from jsonb_array_elements(changes) loop
    coll := change->>'collection';
    rid := change->>'id';
    at := (change->>'updated_at')::timestamptz;
    del := coalesce((change->>'deleted')::boolean, false);
    body := case when del then null else change->'data' end;

    if coll is null or rid is null or at is null then
      raise exception 'each change needs a collection, an id and updated_at' using errcode = '22023';
    end if;

    select * into cur from public.sync_rows r
      where r.user_id = me and r.collection = coll and r.id = rid
      for update;

    next_seq := null;

    if not found then
      next_seq := nextval('public.sync_seq');
      insert into public.sync_rows (user_id, collection, id, data, deleted, updated_at, seq)
      values (me, coll, rid, body, del, at, next_seq);

    elsif cur.deleted then
      if not del then
        rejected := rejected || jsonb_build_array(jsonb_build_object(
          'collection', cur.collection, 'id', cur.id, 'data', cur.data,
          'deleted', cur.deleted, 'updated_at', cur.updated_at, 'seq', cur.seq));
      end if;

    elsif del then
      next_seq := nextval('public.sync_seq');
      update public.sync_rows r
        set deleted = true, data = null, updated_at = greatest(cur.updated_at, at), seq = next_seq
        where r.user_id = me and r.collection = coll and r.id = rid;

    elsif at > cur.updated_at then
      next_seq := nextval('public.sync_seq');
      update public.sync_rows r
        set data = body, updated_at = at, seq = next_seq
        where r.user_id = me and r.collection = coll and r.id = rid;

    elsif at < cur.updated_at or cur.data is distinct from body then
      rejected := rejected || jsonb_build_array(jsonb_build_object(
        'collection', cur.collection, 'id', cur.id, 'data', cur.data,
        'deleted', cur.deleted, 'updated_at', cur.updated_at, 'seq', cur.seq));
    end if;

    if next_seq is not null then
      first_seq := coalesce(first_seq, next_seq);
      last_seq := next_seq;
    end if;
  end loop;

  -- Everything at or past first_seq was written by this call, because the
  -- lock kept every other writer for this account out. Anything between
  -- `since` and there came from somewhere else.
  is_behind := exists (
    select 1 from public.sync_rows r
    where r.user_id = me and r.seq > since and (first_seq is null or r.seq < first_seq)
  );

  return jsonb_build_object(
    'rejected', rejected,
    'behind', is_behind,
    'cursor', case when is_behind then since else greatest(since, coalesce(last_seq, since)) end,
    'now', now()
  );
end;
$$;

revoke all on function public.sync_push(jsonb, bigint) from public, anon;
grant execute on function public.sync_push(jsonb, bigint) to authenticated;

-- The first schema granted this to authenticated but never took it from
-- PUBLIC, so anon could call it too. It failed — there is no user to record —
-- but it should not be callable at all.
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

-- ------------------------------------------- carry over the first schema --
-- Each row becomes a document holding exactly the columns it had, minus
-- user_id. Timestamps are cut to milliseconds, which is all a device writes,
-- so a device's copy and the server's compare equal instead of looking older.
-- All in one block, so the old tables are only dropped once every row has
-- been copied.

do $$
declare
  t text;
begin
  foreach t in array array['skills', 'topics', 'reviews', 'log_entries', 'pairs'] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        $f$insert into public.sync_rows (user_id, collection, id, data, updated_at, seq)
           select o.user_id, %L, o.id::text,
                  jsonb_set(to_jsonb(o) - 'user_id', '{updated_at}',
                            to_jsonb(date_trunc('milliseconds', o.updated_at))),
                  date_trunc('milliseconds', o.updated_at),
                  nextval('public.sync_seq')
           from public.%I o
           on conflict do nothing$f$,
        t, t);
    end if;
  end loop;

  if to_regclass('public.settings') is not null then
    insert into public.sync_rows (user_id, collection, id, data, updated_at, seq)
    select o.user_id, 'settings', 'settings',
           jsonb_set(to_jsonb(o) - 'user_id', '{updated_at}',
                     to_jsonb(date_trunc('milliseconds', o.updated_at))),
           date_trunc('milliseconds', o.updated_at),
           nextval('public.sync_seq')
    from public.settings o
    on conflict do nothing;
  end if;

  drop table if exists public.pairs, public.log_entries, public.reviews,
    public.topics, public.skills, public.settings cascade;
end;
$$;
