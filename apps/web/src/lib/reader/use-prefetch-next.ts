import { type RefObject, useEffect } from 'react';

/** Adds `<link rel="prefetch" href>` once per URL. */
function prefetchDocument(href: string): void {
  const exists = [...document.head.querySelectorAll('link[rel="prefetch"]')].some(
    (link) => link.getAttribute('href') === href,
  );
  if (exists) return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Once the reader reaches `sentinel` (placed ~70% down the chapter), asks the browser to prefetch
 * the next chapter's HTML. A plain `<link rel="prefetch">` to the canonical URL warms both the CDN
 * and the browser cache, and goes through the same cached HTML as a real visit.
 *
 * Checks the position on scroll instead of using an IntersectionObserver: a jump past the sentinel
 * (End key, dragging the scrollbar) never intersects it, so an observer would miss it.
 */
export function usePrefetchNext(sentinel: RefObject<Element | null>, href: string | null): void {
  useEffect(() => {
    const element = sentinel.current;
    if (!href || !element) return;
    let frame: number | null = null;
    const check = () => {
      frame = null;
      if (element.getBoundingClientRect().top >= window.innerHeight) return;
      window.removeEventListener('scroll', onScroll);
      prefetchDocument(href);
    };
    const onScroll = () => {
      frame ??= window.requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // A short chapter may show its 70% mark without any scrolling.
    check();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [sentinel, href]);
}
