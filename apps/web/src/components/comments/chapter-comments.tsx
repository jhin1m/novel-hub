import { m } from '@novel-hub/shared/messages';
import { useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { type CommentChapter, useChapterComments } from '@/lib/comments';
import { useMe } from '@/lib/me';
import { useNearViewport } from '@/lib/use-near-viewport';
import { CommentComposer } from './comment-composer';
import { CommentList } from './comment-list';
import { commentActionClass } from './comment-item';

/**
 * Comments at the end of a chapter. The server-rendered page only has the empty section (its HTML
 * is cached and the same for everyone); the comments load in the browser once the reader scrolls
 * near it, so a read that stops early asks nothing of the origin. Nothing loads while `enabled` is
 * false (the 18+ screen is up).
 */
export function ChapterComments({
  chapter,
  enabled,
}: {
  chapter: CommentChapter;
  enabled: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const near = useNearViewport(ref, enabled);
  const me = useMe();
  const viewer = me.data?.username ?? null;
  // Waits for the session so `isOwn` is right on the first load.
  const comments = useChapterComments(chapter, viewer, near && !me.isPending);
  const total = comments.data?.pages[0]?.total;
  const threads = comments.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section
      ref={ref}
      aria-labelledby={`${id}-heading`}
      className="mt-12 flex flex-col gap-6 border-t border-reader-fg/10 pt-10 font-sans"
    >
      <h2 id={`${id}-heading`} className="text-lg font-extrabold tracking-tight">
        {total == null ? m.comment_heading() : m.comment_heading_count({ count: total })}
      </h2>
      {near ? <CommentComposer chapter={chapter} /> : null}
      {comments.isPending ? (
        near ? (
          <p role="status" className="text-sm text-reader-muted">
            {m.comment_loading()}
          </p>
        ) : null
      ) : comments.isError ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-reader-muted">
          {m.comment_load_error()}
          <Button
            variant="ghost"
            size="sm"
            className={commentActionClass}
            onClick={() => void comments.refetch()}
          >
            {m.comment_retry()}
          </Button>
        </p>
      ) : threads.length === 0 ? (
        <p className="text-sm text-reader-muted">{m.comment_empty()}</p>
      ) : (
        <CommentList chapter={chapter} viewer={viewer} threads={threads} />
      )}
      {comments.hasNextPage ? (
        <Button
          variant="ghost"
          className="self-center bg-reader-card text-reader-fg hover:bg-reader-card/80 hover:text-reader-fg"
          disabled={comments.isFetchingNextPage}
          onClick={() => void comments.fetchNextPage()}
        >
          {m.comment_load_more()}
        </Button>
      ) : null}
    </section>
  );
}
