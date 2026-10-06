import type { CommentDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatInitial } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '../moderation/confirm-dialog';
import { CommentBody, commentOwnAction } from './comment-body';

/** Quiet text buttons under a comment, in the reading preset's colours. */
export const commentActionClass =
  'h-8 px-2 text-reader-muted hover:bg-reader-card hover:text-reader-fg';

/**
 * One comment with its actions: reply, then delete for the writer or `report` (the report button)
 * for anyone else.
 */
export function CommentItem({
  comment,
  onReply,
  onDelete,
  deleting = false,
  report,
  compact = false,
  orphanedParagraph = false,
}: {
  comment: CommentDto;
  onReply?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  report?: ReactNode;
  /** Replies: smaller avatar. */
  compact?: boolean;
  /** A thread about a paragraph since edited out of the chapter: says so above the text. */
  orphanedParagraph?: boolean;
}) {
  return (
    <article className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary',
          compact ? 'size-7 text-xs' : 'size-9 text-sm',
        )}
      >
        {formatInitial(comment.author.displayName)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {orphanedParagraph ? (
          <p className="text-xs text-reader-muted">{m.comment_paragraph_orphaned()}</p>
        ) : null}
        <CommentBody comment={comment} />
        <div className="-ml-2 flex flex-wrap items-center">
          {onReply ? (
            <Button variant="ghost" size="sm" className={commentActionClass} onClick={onReply}>
              {m.comment_reply()}
            </Button>
          ) : null}
          {commentOwnAction(comment) === 'delete' && onDelete ? (
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className={commentActionClass}
                  disabled={deleting}
                >
                  {m.comment_delete()}
                </Button>
              }
              title={m.comment_delete_title()}
              description={m.comment_delete_description()}
              onConfirm={onDelete}
            />
          ) : null}
          {commentOwnAction(comment) === 'report' ? report : null}
        </div>
      </div>
    </article>
  );
}
