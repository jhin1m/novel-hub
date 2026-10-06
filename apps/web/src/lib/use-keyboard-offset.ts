import { useEffect } from 'react';

const PROPERTY = '--keyboard-offset';

/**
 * Publishes the height of the on-screen keyboard as `--keyboard-offset` on `<html>`, so bars fixed
 * to the bottom can sit on top of it. The layout viewport keeps its height when the keyboard opens;
 * only the visual viewport shrinks.
 */
export function useKeyboardOffset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let last = '';
    const update = () => {
      // Pinch-zoom also shrinks the visual viewport; only an unzoomed one means a keyboard.
      const offset =
        viewport.scale > 1 ? 0 : window.innerHeight - viewport.height - viewport.offsetTop;
      const value = `${Math.max(0, Math.round(offset))}px`;
      if (value === last) return;
      last = value;
      root.style.setProperty(PROPERTY, value);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.removeProperty(PROPERTY);
    };
  }, []);
}
