import { m } from '@novel-hub/shared/messages';
import { type RefObject, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { type CommentChapter, useChapterComments } from '@/lib/comments';
import { useMe } from '@/lib/me';
import { findParagraph } from '@/lib/reader/paragraph-elements';
import { CommentComposer } from './comment-composer';
import { CommentFeed } from './comment-feed';

/** The paragraph whose comments are shown; kept while the sheet closes so its content stays. */
export interface OpenParagraph {
  pid: string;
  /** Its words, read from the page when opened. */
  excerpt: string;
  open: boolean;
}

/**
 * Comments about one paragraph: a bottom sheet below `lg`, a right-hand panel from `lg` up. While
 * open, the paragraph is marked with an attribute (`data-pc-active`); no node is added to the
 * text. The sheet portals out of the reading page, so `site-comment-colors` gives the comments the
 * site's colours instead of the reading preset's.
 */
export function ParagraphCommentsSheet({
  chapter,
  paragraph,
  contentRef,
  onClose,
}: {
  chapter: CommentChapter;
  paragraph: OpenParagraph | null;
  contentRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const open = paragraph?.open ?? false;
  const pid = paragraph?.pid ?? null;

  useEffect(() => {
    if (!open || pid === null) return;
    const element = findParagraph(contentRef.current, pid);
    element?.setAttribute('data-pc-active', '');
    return () => element?.removeAttribute('data-pc-active');
  }, [open, pid, contentRef]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/*
       * No dimming and a lower sheet on phones, so the marked paragraph stays in sight (the page
       * moves the text column left of the panel on wide screens). Focus goes to the panel, not the
       * comment box: a phone keyboard would cover the comments the reader came for.
       */}
      <SheetContent
        side="adaptive-right"
        overlayClassName="bg-transparent"
        className="site-comment-colors gap-0 max-lg:max-h-[60dvh]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        {paragraph ? <ParagraphThreads chapter={chapter} paragraph={paragraph} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function ParagraphThreads({
  chapter,
  paragraph,
}: {
  chapter: CommentChapter;
  paragraph: OpenParagraph;
}) {
  const me = useMe();
  const viewer = me.data?.username ?? null;
  // Waits for the session so `isOwn` is right on the first load.
  const comments = useChapterComments(chapter, viewer, !me.isPending, paragraph.pid);
  const total = comments.data?.pages[0]?.total;

  return (
    <>
      <SheetHeader className="pr-12">
        <SheetTitle className="text-lg font-extrabold">
          {total == null
            ? m.comment_paragraph_title()
            : m.comment_paragraph_title_count({ count: total })}
        </SheetTitle>
        <SheetDescription className="line-clamp-3 border-l-2 border-border pl-3 font-serif text-[15px] leading-relaxed">
          {paragraph.excerpt}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6 font-sans">
        <CommentComposer chapter={chapter} paragraphId={paragraph.pid} />
        <CommentFeed
          chapter={chapter}
          viewer={viewer}
          comments={comments}
          active
          emptyText={m.comment_paragraph_empty()}
        />
      </div>
    </>
  );
}
