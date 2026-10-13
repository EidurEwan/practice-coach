/**
 * Whether accounts are offered at all.
 *
 * Off, the sign-in and sign-up entrances are replaced with a note and the
 * screens behind them are left intact — the right state for a build whose
 * project cannot serve accounts (no schema, or no way to send the
 * confirmation email), since a door that does not open is worse than one
 * marked "soon". `scripts/check-supabase.mjs` says whether the project can.
 */
export const ACCOUNTS_ENABLED = true;

/** What to say where an account action used to be. */
export const ACCOUNTS_SOON = 'Accounts are coming soon';
export const ACCOUNTS_SOON_BODY =
  'Backup and syncing between devices are being finished. Everything works without one — your schedule is kept on this device, and Export in Settings takes a copy.';
