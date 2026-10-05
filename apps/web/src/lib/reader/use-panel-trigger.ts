import { type RefObject, useMemo, useRef } from 'react';

/**
 * Sheet props for a panel opened by a plain button rather than a `SheetTrigger`. Like Radix does
 * for its own trigger: focus goes back to the button on close, unless the reader closed the panel
 * by interacting outside a non-modal panel (focus stays where they went); and pressing the button
 * again toggles instead of counting as a click outside (which would close the panel and reopen it).
 */
export function usePanelTrigger(trigger: RefObject<HTMLButtonElement | null>, modal: boolean) {
  const closedFromOutside = useRef(false);
  return useMemo(
    () => ({
      onCloseAutoFocus: (event: Event) => {
        event.preventDefault();
        if (!closedFromOutside.current) trigger.current?.focus();
        closedFromOutside.current = false;
      },
      onInteractOutside: (event: Event) => {
        if (event.target instanceof Node && trigger.current?.contains(event.target)) {
          event.preventDefault();
          return;
        }
        // Behind a modal panel nothing else can take focus, so it always goes back.
        closedFromOutside.current = !modal;
      },
    }),
    [trigger, modal],
  );
}
