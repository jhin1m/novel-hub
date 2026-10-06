import type { CommentDto, CommentThreadDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  type CommentChapter,
  commentErrorMessage,
  useDeleteComment,
  useMoreReplies,
} from '@/lib/comments';
import { ReportButton } from '../report/report-button';
import { CommentComposer } from './comment-composer';
import { CommentItem, commentActionClass } from './comment-item';

/** The comment being answered: its id (the server finds the thread) and who wrote it. */
interface ReplyTarget {
  id: string;
  name: string;
}

/** Threads newest first; each with its replies, oldest first. */
export function CommentList({
  chapter,
  viewer,
  threads,
}: {
  chapter: CommentChapter;
  viewer: string | null;
  threads: CommentThreadDto[];
}) {
  const remove = useDeleteComment(chapter);
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-6">
        {threads.map((thread) => (
          <li key={thread.id}>
            <CommentThread
              chapter={chapter}
              viewer={viewer}
              thread={thread}
              onDelete={(id) => remove.mutate(id)}
              deleting={remove.isPending}
            />
          </li>
        ))}
      </ol>
      {remove.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {commentErrorMessage(remove.error)}
        </p>
      ) : null}
    </div>
  );
}

function CommentThread({
  chapter,
  viewer,
  thread,
  onDelete,
  deleting,
}: {
  chapter: CommentChapter;
  viewer: string | null;
  thread: CommentThreadDto;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [showMore, setShowMore] = useState(false);
  const more = useMoreReplies(chapter, viewer, thread.id, thread.moreRepliesCursor, showMore);
  // The pages after the preview may repeat a reply once the preview moved (a reply deleted).
  const shown = new Set(thread.replies.map((reply) => reply.id));
  const loaded = (more.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (reply) => !shown.has(reply.id),
  );
  const replies = [...thread.replies, ...loaded];
  const hidden = thread.replyCount - replies.length;
  const canLoadMore = showMore ? more.hasNextPage : thread.moreRepliesCursor !== null;

  const item = (comment: CommentDto, compact: boolean) => (
    <CommentItem
      comment={comment}
      compact={compact}
      onReply={() => setReplyTo({ id: comment.id, name: comment.author.displayName })}
      onDelete={() => onDelete(comment.id)}
      deleting={deleting}
      report={
        <ReportButton
          target={{ type: 'comment', commentId: comment.id }}
          className={commentActionClass}
        />
      }
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {item(thread, false)}
      {replies.length > 0 || replyTo || canLoadMore ? (
        <div className="ml-12 flex flex-col gap-3 border-l border-reader-fg/10 pl-4">
          {replies.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {replies.map((reply) => (
                <li key={reply.id}>{item(reply, true)}</li>
              ))}
            </ol>
          ) : null}
          {canLoadMore ? (
            <Button
              variant="ghost"
              size="sm"
              className={`${commentActionClass} self-start`}
              disabled={more.isFetching}
              onClick={() => (showMore ? void more.fetchNextPage() : setShowMore(true))}
            >
              {m.comment_more_replies({ count: Math.max(hidden, 1) })}
            </Button>
          ) : null}
          {more.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {commentErrorMessage(more.error)}
            </p>
          ) : null}
          {replyTo ? (
            <CommentComposer
              key={replyTo.id}
              chapter={chapter}
              parentId={replyTo.id}
              replyTo={replyTo.name}
              onCancel={() => setReplyTo(null)}
              onPosted={() => {
                setReplyTo(null);
                // The new reply is the newest: past the preview once a thread has a few.
                setShowMore(true);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
