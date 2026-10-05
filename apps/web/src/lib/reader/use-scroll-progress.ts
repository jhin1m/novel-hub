import { type RefObject, useEffect, useRef } from 'react';
import { scrollPctOf } from './scroll';

/**
 * Draws how far through the chapter text the reader is on the returned element's ref
 * (`transform: scaleX`), once per animation frame while scrolling, resizing or when the text
 * reflows (reader font size, spacing, column width). Writes the style directly: no React state,
 * so no re-render per frame.
 */
export function useScrollProgress(
  content: RefObject<Element | null>,
): RefObject<HTMLDivElement | null> {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame: number | null = null;
    const draw = () => {
      frame = null;
      const element = content.current;
      if (!element || !bar.current) return;
      bar.current.style.transform = `scaleX(${scrollPctOf(element) / 100})`;
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const reflow = new ResizeObserver(schedule);
    if (content.current) reflow.observe(content.current);
    return () => {
      reflow.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [content]);
  return bar;
}
