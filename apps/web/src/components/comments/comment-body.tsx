import type { CommentDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { formatDate } from '../../lib/format';

/**
 * The action a comment offers besides replying: its writer may delete it, anyone else may report
 * it. Moderators hide comments from the queue, not from here.
 */
export function commentOwnAction(comment: Pick<CommentDto, 'isOwn'>): 'delete' | 'report' {
  return comment.isOwn ? 'delete' : 'report';
}

/**
 * Writer, date and text of a comment. The text is a text node (React escapes it) with line breaks
 * kept by `pre-line`; it is never HTML.
 */
export function CommentBody({ comment }: { comment: CommentDto }) {
  return (
    <>
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
      </p>
      <p className="text-[15px] leading-relaxed break-words whitespace-pre-line">{comment.body}</p>
    </>
  );
}
