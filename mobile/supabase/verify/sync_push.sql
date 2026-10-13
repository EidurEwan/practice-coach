-- Checks the sync schema against the rules the app relies on. Run by
-- verify.sh after both migrations; any failed check raises and stops psql.
--
-- The app's own tests drive an in-memory server that follows these same
-- rules (src/sync/__tests__/fakeServer.ts). This file is what keeps that fake
-- honest: if the SQL and the fake disagree, one of them is wrong.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end;
$$;

create or replace function pg_temp.as_user(u uuid) returns void
language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
$$;

create or replace function pg_temp.push(changes jsonb, since bigint default 0) returns jsonb
language sql as $$ select public.sync_push(changes, since) $$;

create or replace function pg_temp.row_(coll text, rid text, at text, data jsonb, deleted boolean default false)
returns jsonb language sql as $$
  select jsonb_build_object('collection', coll, 'id', rid, 'updated_at', at, 'deleted', deleted, 'data', data)
$$;

-- ------------------------------------------------- carried over from v1 --

select pg_temp.check(
  (select count(*) from public.sync_rows where user_id = '00000000-0000-0000-0000-00000000000a') = 3,
  'the first schema''s skill, topic and settings were carried across');

select pg_temp.check(
  (select data->>'name' from public.sync_rows where collection = 'skills' and id = '10000000-0000-0000-0000-000000000001') = 'Maths',
  'a carried-over row keeps its columns');

select pg_temp.check(
  (select data ? 'user_id' from public.sync_rows where collection = 'skills' limit 1) = false,
  'user_id is not copied into the document');

select pg_temp.check(
  (select extract(microseconds from updated_at)::bigint % 1000 from public.sync_rows
     where collection = 'topics' and id = '20000000-0000-0000-0000-000000000001') = 0,
  'carried-over timestamps are cut to milliseconds');

select pg_temp.check(
  (select (data->>'updated_at')::timestamptz = updated_at from public.sync_rows
     where collection = 'topics' and id = '20000000-0000-0000-0000-000000000001'),
  'the document''s updated_at matches the column after the cut');

select pg_temp.check(to_regclass('public.skills') is null, 'the first schema''s tables are gone');

-- ------------------------------------------------------------ as a user --

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');

do $$
declare
  r jsonb;
  c0 bigint;
begin
  select coalesce(max(seq), 0) into c0 from public.sync_rows;

  r := pg_temp.push(jsonb_build_array(
    pg_temp.row_('skills', 's1', '2026-10-01T10:00:00.000Z', '{"id":"s1","name":"Spanish"}'),
    pg_temp.row_('topics', 't1', '2026-10-01T10:00:00.000Z', '{"id":"t1","skill_id":"s1"}')
  ), 0);
  perform pg_temp.check(jsonb_array_length(r->'rejected') = 0, 'new rows are taken');
  perform pg_temp.check((r->>'behind')::boolean = false, 'a fresh account is not behind');
  perform pg_temp.check((r->>'cursor')::bigint > c0, 'the cursor moves past the device''s own writes');
  perform pg_temp.check(r ? 'now', 'the server says what time it is');

  r := pg_temp.push(jsonb_build_array(
    pg_temp.row_('skills', 's1', '2026-10-01T10:00:00.000Z', '{"id":"s1","name":"Spanish"}')
  ), (r->>'cursor')::bigint);
  perform pg_temp.check(jsonb_array_length(r->'rejected') = 0, 'sending the same version again is not a conflict');
end;
$$;

select pg_temp.check(
  (select count(*) from public.sync_rows) = 2,
  'a user sees only their own rows');

do $$
declare
  r jsonb;
  s0 bigint;
begin
  select seq into s0 from public.sync_rows where id = 's1';

  r := pg_temp.push(jsonb_build_array(
    pg_temp.row_('skills', 's1', '2026-10-01T09:00:00.000Z', '{"id":"s1","name":"Old name"}')
  ));
  perform pg_temp.check(jsonb_array_length(r->'rejected') = 1, 'an older edit is refused');
  perform pg_temp.check(r->'rejected'->0->'data'->>'name' = 'Spanish', 'and the server''s copy comes back with the refusal');
  perform pg_temp.check((select seq from public.sync_rows where id = 's1') = s0, 'a refusal does not move the row in the feed');

  r := pg_temp.push(jsonb_build_array(
    pg_temp.row_('skills', 's1', '2026-10-01T10:00:00.000Z', '{"id":"s1","name":"Same instant"}')
  ));
  perform pg_temp.check(jsonb_array_length(r->'rejected') = 1, 'a different edit with the same timestamp goes to the server''s copy');

  r := pg_temp.push(jsonb_build_array(
    pg_temp.row_('skills', 's1', '2026-10-01T11:00:00.000Z', '{"id":"s1","name":"Español"}')
  ));
  perform pg_temp.check(jsonb_array_length(r->'rejected') = 0, 'a newer edit is taken');
  perform pg_temp.check((select data->>'name' from public.sync_rows where id = 's1') = 'Español', 'and stored');
  perform pg_temp.check((select seq from public.sync_rows where id = 's1') > s0, 'and moves to the end of the feed');
end;
$$;

do $$
declare
  r jsonb;
begin
  r := pg_temp.push(jsonb_build_array(
    pg_temp.row_('topics', 't1', '2026-10-01T09:00:00.000Z', null, true)
  ));
  perform pg_temp.check(jsonb_array_length(r->'rejected') = 0, 'a deletion is taken even when its timestamp is older');
  perform pg_temp.check(
    (select deleted and data is null from public.sync_rows where id = 't1'),
    'a deleted row keeps a tombstone and loses its data');
  perform pg_temp.check(
    (select updated_at = '2026-10-01T10:00:00.000Z'::timestamptz from public.sync_rows where id = 't1'),
    'a tombstone never moves a row''s timestamp backwards');

  r := pg_temp.push(jsonb_build_array(
    pg_temp.row_('topics', 't1', '2026-12-01T00:00:00.000Z', '{"id":"t1","skill_id":"s1","title":"edited offline"}')
  ));
  perform pg_temp.check(jsonb_array_length(r->'rejected') = 1, 'an edit to a deleted row is refused, however new');
  perform pg_temp.check((r->'rejected'->0->>'deleted')::boolean, 'and the tombstone is what comes back');
end;
$$;

-- ------------------------------------------------------- two devices --

do $$
declare
  r jsonb;
  stale bigint;
begin
  select max(seq) into stale from public.sync_rows;

  -- Another device writes.
  perform pg_temp.push(jsonb_build_array(
    pg_temp.row_('reviews', 'r1', '2026-10-02T08:00:00.000Z', '{"id":"r1","topic_id":"t2"}')
  ), stale);

  -- This one has not read the feed since `stale`.
  r := pg_temp.push(jsonb_build_array(
    pg_temp.row_('reviews', 'r2', '2026-10-02T08:01:00.000Z', '{"id":"r2","topic_id":"t2"}')
  ), stale);
  perform pg_temp.check((r->>'behind')::boolean, 'a device that has missed another''s write is told it is behind');
  perform pg_temp.check((r->>'cursor')::bigint = stale, 'and its cursor is not moved past what it has not read');

  r := pg_temp.push('[]'::jsonb, (select max(seq) from public.sync_rows));
  perform pg_temp.check(not (r->>'behind')::boolean, 'a device that has read everything is not behind');
end;
$$;

-- --------------------------------------------------- separate accounts --

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');

do $$
declare
  r jsonb;
begin
  r := pg_temp.push(jsonb_build_array(
    pg_temp.row_('skills', 's1', '2026-10-01T00:00:00.000Z', '{"id":"s1","name":"Someone else''s"}')
  ));
  perform pg_temp.check(jsonb_array_length(r->'rejected') = 0,
    'the same id under a second account is that account''s own row, not a conflict');
  perform pg_temp.check((select count(*) from public.sync_rows) = 1, 'and that account sees only its own');
end;
$$;

-- ----------------------------------------------------------- refusals --

do $$
begin
  begin
    insert into public.sync_rows (user_id, collection, id, data, updated_at, seq)
    values ('00000000-0000-0000-0000-00000000000c', 'skills', 'direct', '{}', now(), 1);
    raise exception 'FAILED: a direct insert was allowed';
  exception when insufficient_privilege then
    raise notice 'ok - rows cannot be written around sync_push';
  end;

  begin
    perform pg_temp.push(jsonb_build_array(
      pg_temp.row_('passwords', 'x', '2026-10-01T00:00:00.000Z', '{"id":"x"}')));
    raise exception 'FAILED: an unknown collection was stored';
  exception when check_violation then
    raise notice 'ok - only known collections are stored';
  end;

  begin
    perform pg_temp.push((select jsonb_agg(pg_temp.row_('reviews', 'bulk' || g, '2026-10-01T00:00:00.000Z', '{"id":"x"}'))
                          from generate_series(1, 501) g));
    raise exception 'FAILED: an oversized batch was taken';
  exception when program_limit_exceeded then
    raise notice 'ok - batches are capped at 500';
  end;

  perform pg_temp.as_user(null);
  begin
    perform pg_temp.push('[]'::jsonb);
    raise exception 'FAILED: a push without a user was taken';
  exception when insufficient_privilege then
    raise notice 'ok - a push needs a signed-in user';
  end;
end;
$$;

reset role;
set role anon;

do $$
begin
  perform public.sync_push('[]'::jsonb, 0);
  raise exception 'FAILED: anon could call sync_push';
exception when insufficient_privilege then
  raise notice 'ok - the anon role cannot call sync_push';
end;
$$;

do $$
begin
  perform public.request_account_deletion();
  raise exception 'FAILED: anon could call request_account_deletion';
exception when insufficient_privilege then
  raise notice 'ok - the anon role cannot call request_account_deletion';
end;
$$;

reset role;

-- ------------------------------------------------ deleting the account --

delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check(
  not exists (select 1 from public.sync_rows where user_id = '00000000-0000-0000-0000-00000000000b'),
  'deleting the account removes its rows');

\echo 'sync schema: all checks passed'
