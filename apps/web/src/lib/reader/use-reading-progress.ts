import { type RefObject, useCallback, useEffect } from 'react';
import { createApiClient } from '../api-client';
import { scrollPctOf } from './scroll';

const api = createApiClient();
const DEBOUNCE_MS = 3_000;
/** `$url()` needs an absolute base, which the same-origin client does not have. */
const PROGRESS_PATH = '/api/v1/reading/progress';

/** A promise that rejects makes the position count as unsaved, so it is sent again. */
type SaveCheckpoint = (scrollPct: number, leaving: boolean) => Promise<unknown> | void;

/**
 * Calls `save` with the reader's position in the chapter: 3 s after scrolling stops, and once more
 * when the page goes away (`leaving`). A position already saved is not saved again. Does nothing
 * while `enabled` is false. `save` must be stable: a new one starts a new chapter's tracking.
 */
export function useScrollCheckpoint(
  content: RefObject<Element | null>,
  enabled: boolean,
  save: SaveCheckpoint,
): void {
  useEffect(() => {
    const element = content.current;
    if (!enabled || !element) return;
    let lastSent: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkpoint = (leaving: boolean) => {
      timer = null;
      const scrollPct = scrollPctOf(element);
      if (scrollPct === lastSent) return;
      lastSent = scrollPct;
      void Promise.resolve(save(scrollPct, leaving)).catch(() => {
        // Best effort: the next scroll or the page leaving sends it again.
        lastSent = null;
      });
    };

    const onScroll = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => checkpoint(false), DEBOUNCE_MS);
    };

    const onLeave = () => {
      if (document.visibilityState !== 'hidden') return;
      if (timer !== null) clearTimeout(timer);
      checkpoint(true);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // `pagehide` for closing and navigating away; `visibilitychange` for tab switches and mobile
    // backgrounding, where `pagehide` may never fire.
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onLeave);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onLeave);
      if (timer !== null) clearTimeout(timer);
    };
  }, [content, enabled, save]);
}

/** Survives the page going away: `sendBeacon`, falling back to a `keepalive` fetch. */
function sendProgressBeacon(body: { publicId: string; number: number; scrollPct: number }) {
  const payload = JSON.stringify(body);
  const queued = navigator.sendBeacon(
    PROGRESS_PATH,
    new Blob([payload], { type: 'application/json' }),
  );
  if (!queued) {
    void fetch(PROGRESS_PATH, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  }
}

/** Saves where a signed-in reader is in the chapter. Off while `enabled` is false (the 18+ screen). */
export function useReadingProgress(
  content: RefObject<Element | null>,
  chapter: { publicId: string; number: number },
  enabled: boolean,
): void {
  const { publicId, number } = chapter;
  const save = useCallback(
    (scrollPct: number, leaving: boolean) => {
      const body = { publicId, number, scrollPct };
      if (leaving) {
        sendProgressBeacon(body);
        return;
      }
      return api.api.v1.reading.progress.$put({ json: body }).then((res) => res.body?.cancel());
    },
    [publicId, number],
  );
  useScrollCheckpoint(content, enabled, save);
}
