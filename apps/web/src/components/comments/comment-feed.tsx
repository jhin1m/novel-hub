import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';
import type { CommentChapter, useChapterComments } from '@/lib/comments';
import { CommentList } from './comment-list';
import { commentActionClass } from './comment-item';

/**
 * A list of threads in each of its states: loading (only once `active`, i.e. asked for), failed
 * with a retry, empty, or the threads with a "more" button. Shared by the chapter's list and a
 * paragraph's.
 */
export function CommentFeed({
  chapter,
  viewer,
  comments,
  active,
  emptyText,
}: {
  chapter: CommentChapter;
  viewer: string | null;
  comments: ReturnType<typeof useChapterComments>;
  active: boolean;
  emptyText: string;
}) {
  const threads = comments.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      {comments.isPending ? (
        active ? (
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
        <p className="text-sm text-reader-muted">{emptyText}</p>
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
    </>
  );
}
