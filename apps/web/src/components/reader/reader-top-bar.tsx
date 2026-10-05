import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { ArrowLeftIcon } from 'lucide-react';
import type { RefObject } from 'react';
import { useScrollProgress } from '@/lib/reader/use-scroll-progress';

interface ReaderTopBarProps {
  story: { slug: string; publicId: string; title: string };
  chapterNumber: number;
  chapterTitle: string | null;
  hidden: boolean;
  /** The chapter text, whose read share the 2px line along the bottom shows. */
  contentRef: RefObject<HTMLDivElement | null>;
  /** Required so the 18+ screen can never be bypassed through the bar. */
  inert: boolean;
}

/**
 * Top of the reading page: back to the story, story title and "Ch. N · title", and a thin reading
 * progress line. Slides away while scrolling down; keyboard focus inside brings it back.
 */
export function ReaderTopBar({
  story,
  chapterNumber,
  chapterTitle,
  hidden,
  contentRef,
  inert,
}: ReaderTopBarProps) {
  const progress = useScrollProgress(contentRef);
  const chapter = m.reader_bar_chapter({ number: chapterNumber });

  return (
    <header
      data-hidden={hidden || undefined}
      inert={inert}
      className="reader-top-bar fixed inset-x-0 top-0 z-30 border-b border-reader-fg/10 bg-reader-bg text-reader-fg"
    >
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2 lg:h-[60px]">
        {/* Full page load: the story page is public, cached HTML. */}
        <a
          href={canonicalPath({ kind: 'story', ...story })}
          aria-label={m.reader_toc_story()}
          className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-reader-fg/5 focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <ArrowLeftIcon className="size-5" />
        </a>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-xs text-reader-muted">{story.title}</p>
          <p className="truncate text-[15px] font-bold">
            {chapterTitle ? `${chapter} · ${chapterTitle}` : chapter}
          </p>
        </div>
      </div>
      <div aria-hidden className="absolute inset-x-0 -bottom-px h-0.5">
        <div ref={progress} className="reader-progress h-full bg-reader-primary" />
      </div>
    </header>
  );
}
