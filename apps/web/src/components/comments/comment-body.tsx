import type { CommentDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { PinIcon } from 'lucide-react';
import { formatDate, formatDateTime } from '../../lib/format';

/**
 * The action a comment offers besides replying: its writer may delete it, anyone else may report
 * it. Moderators hide comments from the queue, not from here.
 */
export function commentOwnAction(comment: Pick<CommentDto, 'isOwn'>): 'delete' | 'report' {
  return comment.isOwn ? 'delete' : 'report';
}

/** Only the writer edits a comment. */
export function canEditComment(comment: Pick<CommentDto, 'isOwn'>): boolean {
  return comment.isOwn;
}

/**
 * The pin button a comment shows: none unless the viewer may pin here (the story's author, on a
 * thread that can be pinned), then "pin" or "unpin" by its state.
 */
export function commentPinAction(
  comment: Pick<CommentDto, 'pinnedAt'>,
  canPin: boolean,
): 'pin' | 'unpin' | null {
  if (!canPin) return null;
  return comment.pinnedAt ? 'unpin' : 'pin';
}

/**
 * Writer, date and text of a comment, with its "pinned" and "edited" marks. The text is a text node
 * (React escapes it) with line breaks kept by `pre-line`; it is never HTML.
 */
export function CommentBody({ comment }: { comment: CommentDto }) {
  return (
    <>
      {comment.pinnedAt ? (
        <p className="inline-flex items-center gap-1 text-xs font-bold text-primary">
          <PinIcon aria-hidden className="size-3.5" />
          {m.comment_pinned()}
        </p>
      ) : null}
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <a
          href={canonicalPath({ kind: 'author', username: comment.author.username })}
          className="font-bold hover:underline"
        >
          {comment.author.displayName}
        </a>
        <time dateTime={comment.createdAt} className="text-xs text-reader-muted">
          {formatDate(comment.createdAt)}
        </time>
        {comment.editedAt ? (
          <span className="text-xs text-reader-muted" title={formatDateTime(comment.editedAt)}>
            {m.comment_edited()}
          </span>
        ) : null}
      </p>
      <p className="text-[15px] leading-relaxed break-words whitespace-pre-line">{comment.body}</p>
    </>
  );
}
