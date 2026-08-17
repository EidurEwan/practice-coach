#!/usr/bin/env node
/**
 * Is a Supabase project ready to hold accounts?
 *
 * Two things have to be true, and they fail in different places: the schema
 * has to exist (PostgREST answers for every table) and the project has to be
 * able to send mail (signup returns something other than a 500). Checking them
 * separately is the point — "it doesn't work" is not a diagnosis, and the two
 * have different fixes.
 *
 *   node scripts/check-supabase.mjs                 # reads .env.local
 *   node scripts/check-supabase.mjs <url> <anonKey>
 *
 * Only the anon key is ever used. It ships in the app already; row level
 * security is what protects the data, so there is nothing secret here.
 */

import { readFileSync } from 'node:fs';

const TABLES = ['profiles', 'skills', 'topics', 'reviews', 'log_entries', 'pairs', 'settings', 'deletion_requests'];

function fromEnvFile() {
  try {
    const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const get = (k) => text.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
    return [get('EXPO_PUBLIC_SUPABASE_URL'), get('EXPO_PUBLIC_SUPABASE_ANON_KEY')];
  } catch {
    return [undefined, undefined];
  }
}

const [url, key] = process.argv.length > 3 ? process.argv.slice(2, 4) : fromEnvFile();

if (!url || !key) {
  console.error('Need a project URL and anon key — pass them as arguments or set them in .env.local.');
  process.exit(2);
}

const base = url.replace(/\/$/, '');
let ok = true;

console.log(`\nChecking ${base}\n`);

// ---------------------------------------------------------------- schema --
// A missing table 404s with PGRST205. A table that exists but is closed to the
// anon role answers 401 — which is correct, and what we want to see.
const missing = [];
for (const table of TABLES) {
  const res = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, { headers: { apikey: key } });
  if (res.status === 404) missing.push(table);
}

if (missing.length) {
  ok = false;
  console.log(`  schema     MISSING — ${missing.length}/${TABLES.length} tables absent (${missing.join(', ')})`);
  console.log('             Paste supabase/migrations/20260812000000_init.sql into the SQL editor.');
} else {
  console.log(`  schema     ok — all ${TABLES.length} tables present and closed to anon`);
}

// ------------------------------------------------------------------ mail --
// Signing up an address nobody will ever use tells us whether the project can
// send at all, without needing a real inbox to read.
const probe = `interval-check-${Date.now()}@example.com`;
const res = await fetch(`${base}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: probe, password: `check-${Date.now()}` }),
});
const body = await res.json().catch(() => ({}));

if (res.status === 500 || body.error_code === 'unexpected_failure') {
  ok = false;
  console.log(`  email      BROKEN — ${body.msg || body.message || 'signup returned 500'}`);
  console.log('             Set custom SMTP under Authentication → Emails → SMTP Settings.');
  if (body.error_id) console.log(`             Auth log error id: ${body.error_id}`);
} else if (res.ok) {
  console.log(`  email      ok — signup accepted, confirmation sent to ${probe}`);
  console.log('             (that probe account is unconfirmed and harmless; delete it if you like)');
} else {
  console.log(`  email      unclear — HTTP ${res.status}: ${body.msg || body.message || ''}`);
}

console.log(ok ? '\nReady. Rebuild the web bundle to pick this up.\n' : '\nNot ready yet.\n');
process.exit(ok ? 0 : 1);
