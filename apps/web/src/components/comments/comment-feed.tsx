import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-errors';
import { type CommentScope, type CommentThreadsQuery, commentErrorMessage } from '@/lib/comments';
import { CommentList } from './comment-list';
import { commentActionClass } from './comment-item';
import { feedThreads } from './comment-views';

/**
 * Why the list failed: a refusal from the server (4xx, e.g. 18+ turned off) in its own words, any
 * other failure (network, server) as the generic "could not load".
 */
function loadErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.status < 500
    ? commentErrorMessage(error)
    : m.comment_load_error();
}

/**
 * A list of threads in each of its states: loading (only once `active`, i.e. asked for), failed
 * with a retry, empty, or the threads (pinned ones first) with a "more" button. Shared by the
 * chapter's list, a paragraph's and the story discussion.
 */
export function CommentFeed({
  scope,
  viewer,
  comments,
  active,
  emptyText,
}: {
  scope: CommentScope;
  viewer: string | null;
  comments: CommentThreadsQuery;
  active: boolean;
  emptyText: string;
}) {
  const { threads, canPin } = feedThreads(comments.data?.pages ?? []);
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
          {loadErrorMessage(comments.error)}
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
        <CommentList scope={scope} viewer={viewer} threads={threads} canPin={canPin} />
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
