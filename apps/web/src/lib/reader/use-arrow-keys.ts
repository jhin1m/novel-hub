import { useEffect } from 'react';

/** True when the key press belongs to something else: a field, a shortcut or an open dialog. */
function shouldIgnore(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return true;
  }
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]'))
  ) {
    return true;
  }
  // Radix dialogs and sheets (table of contents) are only in the DOM while open.
  return document.querySelector('[role="dialog"]') !== null;
}

/**
 * ← / → open the previous / next chapter as a full page load, so the next page comes from the CDN
 * cache like any other visit.
 */
export function useArrowKeys(prevHref: string | null, nextHref: string | null): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const href =
        event.key === 'ArrowLeft' ? prevHref : event.key === 'ArrowRight' ? nextHref : null;
      if (!href || shouldIgnore(event)) return;
      event.preventDefault();
      window.location.assign(href);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [prevHref, nextHref]);
}
