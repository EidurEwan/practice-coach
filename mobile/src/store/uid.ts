/**
 * Row ids are minted on the device and never renumbered by the server, so two
 * phones that were both offline can merge without either losing a review.
 */
export function uid(): string {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  const bytes = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The latest moment this device has stamped or seen, in ms. */
let latest = 0;

/** A clock further ahead than this is wrong, not early, and is not followed. */
const MAX_AHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * The timestamp for a change made here.
 *
 * Sync settles conflicts by "latest timestamp wins", which is only fair if a
 * change made *after* seeing another device's edit is stamped later than that
 * edit. A phone whose clock runs five minutes slow would otherwise download a
 * rating, rate the same topic again, and have its own newer rating thrown
 * away as the older of the two. So stamps never go backwards past anything
 * this device has stamped or seen (see `observeTime`) — wall-clock time in
 * the ordinary case, and just past the latest known moment when the clock
 * lags behind it.
 */
export function nowIso(): string {
  const at = Math.max(Date.now(), latest + 1);
  latest = at;
  return new Date(at).toISOString();
}

/** Records a moment seen elsewhere, so the next local stamp lands after it. */
export function observeTime(at: string | number | null | undefined): void {
  const t = typeof at === 'number' ? at : typeof at === 'string' ? Date.parse(at) : NaN;
  if (Number.isNaN(t) || t > Date.now() + MAX_AHEAD_MS) return;
  if (t > latest) latest = t;
}
