import { m } from '@novel-hub/shared/messages';
import { type ReactNode, type RefObject, useId, useRef, useState } from 'react';
import { type CommentChapter, useChapterComments, useParagraphCommentCounts } from '@/lib/comments';
import { useMe } from '@/lib/me';
import { type ParagraphText, paragraphTexts } from '@/lib/reader/paragraph-elements';
import { useNearViewport } from '@/lib/use-near-viewport';
import { cn } from '@/lib/utils';
import { CommentComposer } from './comment-composer';
import { CommentFeed } from './comment-feed';
import { ParagraphThreadIndex } from './paragraph-thread-index';

/**
 * Comments at the end of a chapter. The server-rendered page only has the empty section (its HTML
 * is cached and the same for everyone); the comments and the per-paragraph counts load in the
 * browser once the reader scrolls near it, so a read that stops early asks nothing of the origin.
 * Nothing loads while `enabled` is false (the 18+ screen is up). Once some paragraph has comments,
 * a second tab lists those paragraphs.
 */
export function ChapterComments({
  chapter,
  enabled,
  contentRef,
  onOpenParagraph,
}: {
  chapter: CommentChapter;
  enabled: boolean;
  /** The chapter text, where the paragraphs are read from. */
  contentRef: RefObject<HTMLElement | null>;
  onOpenParagraph: (pid: string) => void;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const near = useNearViewport(ref, enabled);
  const me = useMe();
  const viewer = me.data?.username ?? null;
  // Waits for the session so `isOwn` is right on the first load.
  const comments = useChapterComments(chapter, viewer, near && !me.isPending);
  const counts = useParagraphCommentCounts(chapter, near);
  const total = comments.data?.pages[0]?.total;
  const paragraphTotal = Object.values(counts.data ?? {}).reduce((sum, count) => sum + count, 0);
  const [byParagraph, setByParagraph] = useState(false);
  // The text never changes on the page, so its paragraphs are read once, when first listed.
  const [paragraphs, setParagraphs] = useState<ParagraphText[] | null>(null);
  const showParagraphs = byParagraph && paragraphTotal > 0;

  return (
    <section
      ref={ref}
      aria-labelledby={`${id}-heading`}
      className="mt-12 flex flex-col gap-6 border-t border-reader-fg/10 pt-10 font-sans"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-lg font-extrabold tracking-tight">
          {total == null ? m.comment_heading() : m.comment_heading_count({ count: total })}
        </h2>
        <p className="text-sm text-reader-muted">{m.comment_paragraph_hint()}</p>
      </div>
      {paragraphTotal > 0 ? (
        <div className="inline-flex gap-1 self-start rounded-full bg-reader-card p-1">
          <TabButton current={!showParagraphs} onClick={() => setByParagraph(false)}>
            {m.comment_paragraph_tab_chapter()}
          </TabButton>
          <TabButton
            current={showParagraphs}
            onClick={() => {
              if (!paragraphs) setParagraphs(paragraphTexts(contentRef.current));
              setByParagraph(true);
            }}
          >
            {m.comment_paragraph_tab_paragraphs({ count: paragraphTotal })}
          </TabButton>
        </div>
      ) : null}
      {showParagraphs && counts.data ? (
        <ParagraphThreadIndex
          paragraphs={paragraphs ?? []}
          counts={counts.data}
          onOpen={onOpenParagraph}
        />
      ) : (
        <>
          {near ? <CommentComposer chapter={chapter} /> : null}
          <CommentFeed
            chapter={chapter}
            viewer={viewer}
            comments={comments}
            active={near}
            emptyText={m.comment_empty()}
          />
        </>
      )}
    </section>
  );
}

/** One pill of the chapter / by-paragraph switch, in the reading preset's colours. */
function TabButton({
  current,
  onClick,
  children,
}: {
  current: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={current}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        current
          ? 'bg-reader-bg font-bold text-reader-fg'
          : 'font-semibold text-reader-muted hover:text-reader-fg',
      )}
    >
      {children}
    </button>
  );
}
