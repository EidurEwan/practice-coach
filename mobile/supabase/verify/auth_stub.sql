-- Just enough of Supabase for the migrations to run on a bare Postgres:
-- the two API roles, auth.users, and auth.uid() reading the JWT subject the
-- way the real one does. Used by verify.sh, never by a real project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- Supabase's own definition: PostgREST sets request.jwt.claims; older
-- versions set request.jwt.claim.sub, which the checks use directly.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated;
