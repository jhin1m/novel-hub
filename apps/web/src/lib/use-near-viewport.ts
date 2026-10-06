import { type RefObject, useEffect, useState } from 'react';

/**
 * Turns `true` once the element comes within `rootMargin` of the viewport, and stays `true`, so a
 * section below the fold (comments, reviews) loads only when the reader gets close to it. An
 * element already in view on the first paint (a short chapter) reports at once. Nothing is observed
 * while `enabled` is false; every browser this site supports has `IntersectionObserver`.
 */
export function useNearViewport(
  ref: RefObject<Element | null>,
  enabled: boolean,
  rootMargin = '600px',
): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || near || !element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled, near, rootMargin]);
  return near;
}
