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
    <article
      className="relative"
      onClick={(event) => {
        if (event.detail >= 3) keepTripleClickInParagraph(event.currentTarget);
        onClick(event);
      }}
    >
      <div ref={contentRef} className="reader-content" dangerouslySetInnerHTML={{ __html: html }} />
      <div
        ref={sentinel}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[70%] h-px select-none"
      />
    </article>
  );
}

/**
 * A triple click selects a paragraph up to the start of whatever follows it. After the last
 * paragraph that is outside the text (the chapter end), which spills the highlight over the
 * footer and no longer reads as one paragraph to comment on: end it at the paragraph instead.
 */
function keepTripleClickInParagraph(article: HTMLElement) {
  const content = article.querySelector('.reader-content');
  const selection = window.getSelection();
  if (!content || !selection || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  if (content.contains(range.endContainer)) return;
  const start = range.startContainer;
  const startElement = start instanceof Element ? start : start.parentElement;
  const paragraph = startElement?.closest('[data-pid]');
  if (!paragraph || !content.contains(paragraph)) return;
  // A triple click dragged on over more text is a wider selection on purpose: leave it.
  const tail = document.createRange();
  tail.setStart(paragraph, paragraph.childNodes.length);
  tail.setEnd(range.endContainer, range.endOffset);
  if (tail.toString().trim() !== '') return;
  selection.setBaseAndExtent(start, range.startOffset, paragraph, paragraph.childNodes.length);
}
