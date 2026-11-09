import type { CommentDto, CommentThreadDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  type CommentScope,
  commentErrorMessage,
  useDeleteComment,
  useMoreReplies,
  usePinComment,
} from '@/lib/comments';
import { useMe } from '@/lib/me';
import { ReportButton } from '../report/report-button';
import { CommentComposer } from './comment-composer';
import { CommentItem, commentActionClass } from './comment-item';
import { composerView } from './comment-views';

/** The comment being answered: its id (the server finds the thread) and who wrote it. */
interface ReplyTarget {
  id: string;
  name: string;
}

/**
 * Threads as listed: the pinned ones first, then the others newest first; each with its replies,
 * oldest first. `canPin`: the viewer is the story's author, so top-level comments get a pin button.
 */
export function CommentList({
  scope,
  viewer,
  threads,
  canPin = false,
}: {
  scope: CommentScope;
  viewer: string | null;
  threads: CommentThreadDto[];
  canPin?: boolean;
}) {
  const remove = useDeleteComment(scope);
  const pin = usePinComment(scope);
  // Each action clears the other's error, so only the latest failure shows.
  const failed = remove.isError ? remove.error : pin.isError ? pin.error : null;
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-6">
        {threads.map((thread) => (
          <li key={thread.id}>
            <CommentThread
              scope={scope}
              viewer={viewer}
              thread={thread}
              onDelete={(id) => {
                pin.reset();
                remove.mutate(id);
              }}
              deleting={remove.isPending}
              // A thread kept for a paragraph edited out of the text is not the chapter's to pin.
              onTogglePin={
                canPin && !thread.orphanedParagraph
                  ? () => {
                      remove.reset();
                      pin.mutate({ id: thread.id, pinned: thread.pinnedAt === null });
                    }
                  : undefined
              }
              pinning={pin.isPending}
            />
          </li>
        ))}
      </ol>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {commentErrorMessage(failed)}
        </p>
      ) : null}
    </div>
  );
}

function CommentThread({
  scope,
  viewer,
  thread,
  onDelete,
  deleting,
  onTogglePin,
  pinning,
}: {
  scope: CommentScope;
  viewer: string | null;
  thread: CommentThreadDto;
  onDelete: (id: string) => void;
  deleting: boolean;
  onTogglePin: (() => void) | undefined;
  pinning: boolean;
}) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const me = useMe();
  // Editing is posting again: a muted or unverified writer gets no edit box (it would only show
  // the notice, in place of the comment).
  const canWrite = composerView(me.isPending, me.data) === 'form';
  const [showMore, setShowMore] = useState(false);
  const more = useMoreReplies(scope, viewer, thread.id, thread.moreRepliesCursor, showMore);
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
      orphanedParagraph={!compact && thread.orphanedParagraph}
      onReply={() => setReplyTo({ id: comment.id, name: comment.author.displayName })}
      onEdit={canWrite ? () => setEditing(comment.id) : undefined}
      onDelete={() => onDelete(comment.id)}
      deleting={deleting}
      onTogglePin={compact ? undefined : onTogglePin}
      pinning={pinning}
      editor={
        canWrite && editing === comment.id ? (
          <CommentComposer
            scope={scope}
            edit={{ id: comment.id, body: comment.body }}
            onCancel={() => setEditing(null)}
            onPosted={() => setEditing(null)}
          />
        ) : undefined
      }
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
              scope={scope}
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
