import { type RefObject, useEffect } from 'react';
import { createApiClient } from '../api-client';
import { scrollPctOf } from './scroll';

const api = createApiClient();
const DEBOUNCE_MS = 3_000;
/** `$url()` needs an absolute base, which the same-origin client does not have. */
const PROGRESS_PATH = '/api/v1/reading/progress';

/**
 * Saves where a signed-in reader is in the chapter: 3 s after scrolling stops (typed `hc` call),
 * and once more when the page goes away (`sendBeacon`, falling back to a `keepalive` fetch). A
 * position already saved is never sent again. Does nothing while `enabled` is false (guests,
 * the 18+ screen).
 */
export function useReadingProgress(
  content: RefObject<Element | null>,
  chapter: { publicId: string; number: number },
  enabled: boolean,
): void {
  const { publicId, number } = chapter;
  useEffect(() => {
    const element = content.current;
    if (!enabled || !element) return;
    let lastSent: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const current = () => ({ publicId, number, scrollPct: scrollPctOf(element) });

    const save = () => {
      timer = null;
      const body = current();
      if (body.scrollPct === lastSent) return;
      lastSent = body.scrollPct;
      void api.api.v1.reading.progress
        .$put({ json: body })
        .then((res) => res.body?.cancel())
        .catch(() => {
          // Best effort: the next scroll or the page leaving sends it again.
          lastSent = null;
        });
    };

    const onScroll = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE_MS);
    };

    const onLeave = () => {
      if (document.visibilityState !== 'hidden') return;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const body = current();
      if (body.scrollPct === lastSent) return;
      lastSent = body.scrollPct;
      const url = PROGRESS_PATH;
      const payload = JSON.stringify(body);
      const queued = navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      if (!queued) {
        void fetch(url, {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        }).catch(() => {});
      }
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
  }, [content, publicId, number, enabled]);
}
