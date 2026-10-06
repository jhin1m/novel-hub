import { type RefObject, useEffect, useState } from 'react';
import { pidFromSelection } from './paragraph-selection';

/** Waits for the selection to settle: dragging or a long press fires many changes. */
const SETTLE_MS = 150;

export interface ParagraphSelection {
  pid: string;
  /** Where the "comment on this" button goes so it never covers the selection. */
  placement: 'top' | 'bottom';
}

/**
 * The paragraph (or heading) of the chapter text the reader has selected some text in, or `null`.
 * Nothing is listened to while `enabled` is false (the 18+ screen is up).
 */
export function useParagraphSelection(
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): ParagraphSelection | null {
  const [selected, setSelected] = useState<ParagraphSelection | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const update = () => {
      const selection = window.getSelection();
      const pid = pidFromSelection(selection, contentRef.current);
      if (!pid || !selection) {
        setSelected(null);
        return;
      }
      // A selection in the lower half would sit under a button at the bottom.
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const placement = rect.bottom > window.innerHeight / 2 ? 'top' : 'bottom';
      setSelected((current) =>
        current?.pid === pid && current.placement === placement ? current : { pid, placement },
      );
    };
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, SETTLE_MS);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.clearTimeout(timer);
    };
  }, [contentRef, enabled]);

  return enabled ? selected : null;
}
