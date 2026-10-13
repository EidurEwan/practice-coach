#!/usr/bin/env bash
# Applies every migration to an empty Postgres and checks the sync rules.
#
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
#     supabase/verify/verify.sh
#
# The database should be empty: it gets a stub of Supabase's auth schema, the
# first schema with a little data in it (so the carry-over is exercised), then
# the second schema, then the checks.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../migrations"
psql=(psql "${DATABASE_URL:?set DATABASE_URL}" -v ON_ERROR_STOP=1 -q)
# The migrations' "skipping" notices are noise here; the checks use notices
# for their own output, so they are only silenced until then.
export PGOPTIONS="-c client_min_messages=warning"

"${psql[@]}" -f "$here/auth_stub.sql"
"${psql[@]}" -f "$migrations/20260812000000_init.sql"

# Something for the carry-over to move.
"${psql[@]}" <<'SQL'
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');
insert into public.skills (id, user_id, name, genre, updated_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Maths', 'reasoning',
   '2026-08-13T00:18:28.276321+00:00');
insert into public.topics (id, user_id, skill_id, title, due_on, updated_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   '10000000-0000-0000-0000-000000000001', 'Integration', '2026-08-14', '2026-08-13T00:18:28.276321+00:00');
insert into public.settings (user_id, daily_capacity) values ('00000000-0000-0000-0000-00000000000a', 12);
SQL

# Twice: the migration promises it is safe to run more than once.
"${psql[@]}" -f "$migrations/20261013000000_sync_rows.sql"
"${psql[@]}" -f "$migrations/20261013000000_sync_rows.sql"

PGOPTIONS="" "${psql[@]}" -f "$here/sync_push.sql"
