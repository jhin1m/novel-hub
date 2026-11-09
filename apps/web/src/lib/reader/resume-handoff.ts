/**
 * Handoffs from one page to the chapter page it opens next: where to scroll to ("continue
 * reading"), or that listening goes on. Kept in `sessionStorage` (it survives the full document
 * load in the same tab) rather than in the URL, because chapter URLs are canonical and shareable
 * and must not carry state.
 */

/** A handoff older than this is stale: the chapter was not opened by the page that left it. */
const MAX_AGE_MS = 60_000;

type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface Envelope {
  publicId: string;
  number: number;
  at: number;
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.publicId === 'string' && typeof v.number === 'number' && typeof v.at === 'number';
}

/**
 * A one-shot handoff under `key` addressed to one chapter, carrying a payload checked by
 * `isPayload` on the way back.
 */
export function createChapterHandoff<T extends object>(
  key: string,
  isPayload: (value: unknown) => value is T,
) {
  return {
    /** Remembers the payload for chapter `number` of `publicId`, just before navigating. Best effort. */
    set(
      publicId: string,
      number: number,
      payload: T,
      now = Date.now(),
      storage?: HandoffStorage,
    ): void {
      try {
        (storage ?? window.sessionStorage).setItem(
          key,
          JSON.stringify({ ...payload, publicId, number, at: now }),
        );
      } catch {
        // Storage blocked: the next page simply starts afresh.
      }
    },

    /**
     * The payload left for chapter `number` of `publicId`, or `null`. The handoff is removed either
     * way, so it applies to one page load only.
     */
    take(publicId: string, number: number, now = Date.now(), storage?: HandoffStorage): T | null {
      let raw: string | null;
      try {
        const store = storage ?? window.sessionStorage;
        raw = store.getItem(key);
        store.removeItem(key);
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
      if (!isEnvelope(handoff) || !isPayload(handoff)) return null;
      const fresh = handoff.at <= now && now - handoff.at < MAX_AGE_MS;
      return fresh && handoff.publicId === publicId && handoff.number === number ? handoff : null;
    },
  };
}

function isScrollPayload(value: unknown): value is { scrollPct: number } {
  if (typeof value !== 'object' || value === null) return false;
  const pct = (value as Record<string, unknown>).scrollPct;
  return typeof pct === 'number' && pct >= 0 && pct <= 100;
}

const resume = createChapterHandoff('nh:resume', isScrollPayload);

/** Remembers where to resume, just before navigating to the chapter. Best effort. */
export function setResumeHandoff(
  handoff: { publicId: string; number: number; scrollPct: number },
  now = Date.now(),
  storage?: HandoffStorage,
): void {
  resume.set(handoff.publicId, handoff.number, { scrollPct: handoff.scrollPct }, now, storage);
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
  return resume.take(publicId, number, now, storage)?.scrollPct ?? null;
}
