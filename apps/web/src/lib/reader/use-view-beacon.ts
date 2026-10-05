import { VIEW_RULES } from '@novel-hub/shared';
import { useEffect } from 'react';
import { createApiClient } from '../api-client';

const api = createApiClient();

/**
 * Reports one read once the tab has been visible on the chapter for `VIEW_RULES.minDwellMs` in
 * total (hidden time does not count), at most once per page load. Guests too; the server applies
 * the per-day caps. Does nothing while `enabled` is false (18+ screen showing).
 */
export function useViewBeacon(
  chapter: { publicId: string; number: number },
  enabled: boolean,
): void {
  const { publicId, number } = chapter;
  useEffect(() => {
    if (!enabled) return;
    let visibleMs = 0;
    let visibleSince: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sent = false;

    const send = () => {
      timer = null;
      if (sent) return;
      sent = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void api.api.v1.reading.view
        .$post({ json: { publicId, number } }, { init: { keepalive: true } })
        .then((res) => res.body?.cancel())
        .catch(() => {});
    };

    const start = () => {
      visibleSince = Date.now();
      timer = setTimeout(send, Math.max(0, VIEW_RULES.minDwellMs - visibleMs));
    };

    const pause = () => {
      if (visibleSince !== null) visibleMs += Date.now() - visibleSince;
      visibleSince = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        if (visibleSince === null) start();
      } else {
        pause();
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') start();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer !== null) clearTimeout(timer);
    };
  }, [publicId, number, enabled]);
}
