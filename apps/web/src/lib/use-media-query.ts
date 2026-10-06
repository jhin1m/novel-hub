import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept in sync as the window changes. For browser-only routes:
 * the server snapshot is `false`, so a server-rendered page would hydrate with the narrow layout.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
