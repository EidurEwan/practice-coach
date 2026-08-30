/**
 * Whether accounts are offered at all.
 *
 * The sign-in and sign-up flows are built and tested, but the project behind
 * them cannot serve them yet — its schema is not applied and it cannot send a
 * confirmation email, so every attempt ends in a 500 the person can do nothing
 * about. Offering a door that does not open is worse than saying it is not
 * ready, so the entrances are replaced with a note and the screens behind them
 * are left intact.
 *
 * Flip this to `true` once `scripts/check-supabase.mjs` reports green; nothing
 * else needs changing.
 */
export const ACCOUNTS_ENABLED = false;

/** What to say where an account action used to be. */
export const ACCOUNTS_SOON = 'Accounts are coming soon';
export const ACCOUNTS_SOON_BODY =
  'Backup and syncing between devices are being finished. Everything works without one — your schedule is kept on this device, and Export in Settings takes a copy.';
