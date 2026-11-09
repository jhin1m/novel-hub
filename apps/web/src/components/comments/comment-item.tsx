import type { CommentDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatInitial } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '../moderation/confirm-dialog';
import { CommentBody, canEditComment, commentOwnAction, commentPinAction } from './comment-body';

/** Quiet text buttons under a comment, in the reading preset's colours. */
export const commentActionClass =
  'h-8 px-2 text-reader-muted hover:bg-reader-card hover:text-reader-fg';

/**
 * One comment with its actions: reply, edit and delete for the writer or `report` (the report
 * button) for anyone else, and pin or unpin when `onTogglePin` is set (the story's author on a
 * thread that can be pinned). While `editor` is set it takes the place of the text and actions.
 */
export function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
  deleting = false,
  onTogglePin,
  pinning = false,
  editor,
  report,
  compact = false,
  orphanedParagraph = false,
}: {
  comment: CommentDto;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  onTogglePin?: () => void;
  pinning?: boolean;
  editor?: ReactNode;
  report?: ReactNode;
  /** Replies: smaller avatar. */
  compact?: boolean;
  /** A thread about a paragraph since edited out of the chapter: says so above the text. */
  orphanedParagraph?: boolean;
}) {
  const pin = commentPinAction(comment, onTogglePin !== undefined);
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
        {editor ?? (
          <>
            <CommentBody comment={comment} />
            <div className="-ml-2 flex flex-wrap items-center">
              {onReply ? (
                <Button variant="ghost" size="sm" className={commentActionClass} onClick={onReply}>
                  {m.comment_reply()}
                </Button>
              ) : null}
              {canEditComment(comment) && onEdit ? (
                <Button variant="ghost" size="sm" className={commentActionClass} onClick={onEdit}>
                  {m.comment_edit()}
                </Button>
              ) : null}
              {pin ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className={commentActionClass}
                  disabled={pinning}
                  onClick={onTogglePin}
                >
                  {pin === 'pin' ? m.comment_pin() : m.comment_unpin()}
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
          </>
        )}
      </div>
    </article>
  );
}
