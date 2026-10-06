import { LIMITS, normalizePlainText, plainTextLength } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { type CommentChapter, commentErrorMessage, useCreateComment } from '@/lib/comments';
import { useMe } from '@/lib/me';
import { commentActionClass } from './comment-item';

/**
 * Where a comment is written. What shows depends on the account: guests get a sign-in link,
 * an unverified email a reminder, a muted account a notice; only an account allowed to post (the
 * rule of `canPostCommunityContent`, checked again on the server) gets the form.
 */
export function CommentComposer({
  chapter,
  parentId,
  replyTo,
  onCancel,
  onPosted,
}: {
  chapter: CommentChapter;
  /** Set for a reply: the comment answered (the server attaches it to its thread). */
  parentId?: string;
  replyTo?: string;
  onCancel?: () => void;
  onPosted?: () => void;
}) {
  const me = useMe();
  if (me.isPending) return null;
  if (!me.data) {
    return (
      <p className="text-sm text-reader-muted">
        <Link to="/sign-in" className="font-bold text-primary hover:underline">
          {m.comment_sign_in()}
        </Link>{' '}
        {m.comment_sign_in_prompt()}
      </p>
    );
  }
  if (me.data.status === 'muted') {
    return <p className="text-sm text-reader-muted">{m.comment_muted()}</p>;
  }
  if (!me.data.emailVerified) {
    return <p className="text-sm text-reader-muted">{m.comment_verify_prompt()}</p>;
  }
  return (
    <CommentForm
      chapter={chapter}
      parentId={parentId}
      replyTo={replyTo}
      onCancel={onCancel}
      onPosted={onPosted}
    />
  );
}

function CommentForm({
  chapter,
  parentId,
  replyTo,
  onCancel,
  onPosted,
}: {
  chapter: CommentChapter;
  parentId: string | undefined;
  replyTo: string | undefined;
  onCancel: (() => void) | undefined;
  onPosted: (() => void) | undefined;
}) {
  const id = useId();
  const [body, setBody] = useState('');
  const create = useCreateComment(chapter);
  const length = plainTextLength(body.trim());
  const sendable = normalizePlainText(body, LIMITS.commentMax) !== null;
  const label = replyTo ? m.comment_reply_to({ name: replyTo }) : m.comment_body_label();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sendable || create.isPending) return;
        create.mutate(parentId ? { body, parentId } : { body }, {
          onSuccess: () => {
            setBody('');
            onPosted?.();
          },
        });
      }}
    >
      <label htmlFor={`${id}-body`} className={replyTo ? 'text-xs text-reader-muted' : 'sr-only'}>
        {label}
      </label>
      <Textarea
        id={`${id}-body`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? m.comment_reply_placeholder() : m.comment_placeholder()}
        aria-describedby={`${id}-count`}
        aria-invalid={length > LIMITS.commentMax || undefined}
        autoFocus={!!parentId}
        className="max-h-72 min-h-20 border-reader-fg/15 bg-reader-card text-reader-fg placeholder:text-reader-muted"
      />
      <div className="flex items-center justify-end gap-2">
        <p
          id={`${id}-count`}
          className={
            length > LIMITS.commentMax
              ? 'mr-auto text-xs text-destructive'
              : 'mr-auto text-xs text-reader-muted'
          }
        >
          {m.comment_char_count({ count: length, max: LIMITS.commentMax })}
        </p>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={commentActionClass}
            onClick={onCancel}
          >
            {m.comment_cancel()}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={!sendable || create.isPending}>
          {m.comment_submit()}
        </Button>
      </div>
      {create.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {commentErrorMessage(create.error)}
        </p>
      ) : null}
    </form>
  );
}
