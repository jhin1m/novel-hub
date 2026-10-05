import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';

/** Scrolling less than this (px) between frames does not change the bar. */
const SCROLL_SLACK = 8;
/** Near the top of the page the bar always shows. */
const TOP_ZONE = 64;

/**
 * Reading bar visibility: hidden while scrolling down, shown when scrolling up, near the top, or
 * on a tap in the middle third of the screen.
 */
export function useNavVisibility() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (y < TOP_ZONE) setHidden(false);
        else if (delta > SCROLL_SLACK) setHidden(true);
        else if (delta < -SCROLL_SLACK) setHidden(false);
        else return;
        lastY.current = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  /** Click handler for the reading area: a tap in the middle third toggles the bar. */
  const onReadingAreaClick = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, textarea, select, [role="button"]')) return;
    // Selecting text ends with a click too; that is not a tap.
    if (window.getSelection()?.isCollapsed === false) return;
    const third = window.innerHeight / 3;
    if (event.clientY < third || event.clientY > 2 * third) return;
    setHidden((value) => !value);
  }, []);

  return { hidden, onReadingAreaClick };
}
