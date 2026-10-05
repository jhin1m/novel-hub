import { type MouseEvent, type RefObject, useRef } from 'react';
import { usePrefetchNext } from '@/lib/reader/use-prefetch-next';

/**
 * The chapter HTML as stored at publish time (sanitized on the server, paragraphs carry
 * `data-pid`). Never rendered through the editor. A sentinel at 70% of the text triggers the
 * next-chapter prefetch.
 */
export function ChapterContent({
  html,
  nextHref,
  onClick,
  contentRef,
}: {
  html: string;
  nextHref: string | null;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  /** The chapter text, for measuring reading progress. */
  contentRef?: RefObject<HTMLDivElement | null>;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  usePrefetchNext(sentinel, nextHref);
  return (
    // The click only toggles the reading bar; keyboard users have the bar's own controls.
    <article className="relative" onClick={onClick}>
      <div ref={contentRef} className="reader-content" dangerouslySetInnerHTML={{ __html: html }} />
      <div
        ref={sentinel}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[70%] h-px"
      />
    </article>
  );
}
