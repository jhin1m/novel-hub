/**
 * Handoff from "continue reading" to the chapter page it opens: where to scroll to. Kept in
 * `sessionStorage` (it survives the full document load in the same tab) rather than in the URL,
 * because chapter URLs are canonical and shareable and must not carry a position.
 */

const KEY = 'nh:resume';
/** A handoff older than this is stale: the chapter was not opened from the button. */
const MAX_AGE_MS = 60_000;

type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface Handoff {
  publicId: string;
  number: number;
  scrollPct: number;
  at: number;
}

function isHandoff(value: unknown): value is Handoff {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.publicId === 'string' &&
    typeof v.number === 'number' &&
    typeof v.scrollPct === 'number' &&
    v.scrollPct >= 0 &&
    v.scrollPct <= 100 &&
    typeof v.at === 'number'
  );
}

/** Remembers where to resume, just before navigating to the chapter. Best effort. */
export function setResumeHandoff(
  handoff: Omit<Handoff, 'at'>,
  now = Date.now(),
  storage?: HandoffStorage,
): void {
  try {
    (storage ?? window.sessionStorage).setItem(KEY, JSON.stringify({ ...handoff, at: now }));
  } catch {
    // Storage blocked: the chapter opens at the top.
  }
}

/**
 * The position to resume chapter `number` of `publicId` at, or `null`. The handoff is removed
 * either way, so it applies to one page load only.
 */
export function takeResumeHandoff(
  publicId: string,
  number: number,
  now = Date.now(),
  storage?: HandoffStorage,
): number | null {
  let raw: string | null;
  try {
    const store = storage ?? window.sessionStorage;
    raw = store.getItem(KEY);
    store.removeItem(KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let handoff: unknown;
  try {
    handoff = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isHandoff(handoff)) return null;
  const fresh = handoff.at <= now && now - handoff.at < MAX_AGE_MS;
  return fresh && handoff.publicId === publicId && handoff.number === number
    ? handoff.scrollPct
    : null;
}
