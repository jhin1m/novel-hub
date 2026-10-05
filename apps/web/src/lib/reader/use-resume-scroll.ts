import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { takeResumeHandoff } from './resume-handoff';
import { pctToScrollY } from './scroll';

/** Longest wait for web fonts before scrolling: their metrics change the height of the text. */
const FONTS_WAIT_MS = 500;

/**
 * Scrolls to the position "continue reading" handed over for this chapter, if any. Runs after the
 * router's own scroll restoration (layout effect, then fonts, then a frame), which would otherwise
 * put the page back at the top. Returns `true` while the scroll is still pending, so the progress
 * tracker does not record the top of the chapter in the meantime.
 */
export function useResumeScroll(
  content: RefObject<Element | null>,
  chapter: { publicId: string; number: number },
): boolean {
  const { publicId, number } = chapter;
  const [restoring, setRestoring] = useState(false);
  // Taken once: development StrictMode runs the effect twice, and taking removes the handoff.
  const pending = useRef<{ key: string; pct: number | null } | null>(null);

  useLayoutEffect(() => {
    const key = `${publicId}/${number}`;
    if (pending.current?.key !== key) {
      pending.current = { key, pct: takeResumeHandoff(publicId, number) };
    }
    const { pct } = pending.current;
    if (pct === null) return;
    setRestoring(true);
    let cancelled = false;
    let frame = 0;
    const fonts = document.fonts?.ready ?? Promise.resolve();
    const timeout = new Promise((resolve) => setTimeout(resolve, FONTS_WAIT_MS));
    void Promise.race([fonts, timeout]).then(() => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        const element = content.current;
        if (element) window.scrollTo(0, pctToScrollY(element, pct));
        if (pending.current) pending.current.pct = null;
        setRestoring(false);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [content, publicId, number]);

  return restoring;
}
