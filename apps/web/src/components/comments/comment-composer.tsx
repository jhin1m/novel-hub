import { LIMITS, normalizePlainText, plainTextLength } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  type CommentScope,
  commentErrorMessage,
  useCreateComment,
  useEditComment,
} from '@/lib/comments';
import { useMe } from '@/lib/me';
import { commentActionClass } from './comment-item';
import { composerView } from './comment-views';
import { SignInPromptLink } from '../sign-in-prompt-link';

/**
 * Where a comment is written, or with `edit` rewritten. What shows depends on the account: guests
 * get a sign-in link, an unverified email a reminder, a muted account a notice; only an account
 * allowed to post (the rule of `canPostCommunityContent`, checked again on the server) gets the
 * form. `placeholder` replaces the default prompt of a new top-level comment.
 */
export function CommentComposer({
  scope,
  paragraphId,
  parentId,
  replyTo,
  edit,
  placeholder,
  onCancel,
  onPosted,
}: {
  scope: CommentScope;
  /** Set for a new thread about a paragraph (`data-pid`). */
  paragraphId?: string;
  /** Set for a reply: the comment answered (the server attaches it to its thread). */
  parentId?: string;
  replyTo?: string;
  /** The reader's own comment being edited: the form starts with its text and saves over it. */
  edit?: { id: string; body: string };
  placeholder?: string;
  onCancel?: () => void;
  onPosted?: () => void;
}) {
  const me = useMe();
  const view = composerView(me.isPending, me.data);
  if (view === 'pending') return null;
  if (view === 'guest') {
    return (
      <p className="text-sm text-reader-muted">
        <SignInPromptLink reason="comment" className="font-bold text-primary hover:underline">
          {m.comment_sign_in()}
        </SignInPromptLink>{' '}
        {m.comment_sign_in_prompt()}
      </p>
    );
  }
  if (view === 'muted') return <p className="text-sm text-reader-muted">{m.comment_muted()}</p>;
  if (view === 'unverified') {
    return <p className="text-sm text-reader-muted">{m.comment_verify_prompt()}</p>;
  }
  return (
    <CommentForm
      scope={scope}
      paragraphId={paragraphId}
      parentId={parentId}
      replyTo={replyTo}
      edit={edit}
      placeholder={placeholder}
      onCancel={onCancel}
      onPosted={onPosted}
    />
  );
}

function CommentForm({
  scope,
  paragraphId,
  parentId,
  replyTo,
  edit,
  placeholder,
  onCancel,
  onPosted,
}: {
  scope: CommentScope;
  paragraphId: string | undefined;
  parentId: string | undefined;
  replyTo: string | undefined;
  edit: { id: string; body: string } | undefined;
  placeholder: string | undefined;
  onCancel: (() => void) | undefined;
  onPosted: (() => void) | undefined;
}) {
  const id = useId();
  const [body, setBody] = useState(edit?.body ?? '');
  const create = useCreateComment(scope);
  const update = useEditComment(scope);
  const saving = edit ? update : create;
  const length = plainTextLength(body.trim());
  const normalized = normalizePlainText(body, LIMITS.commentMax);
  // Saving an edit that changes nothing would only mark it edited (and drop a pin).
  const sendable = normalized !== null && (!edit || normalized !== edit.body);
  const label = edit
    ? m.comment_edit_label()
    : replyTo
      ? m.comment_reply_to({ name: replyTo })
      : m.comment_body_label();
  const onSuccess = () => {
    setBody('');
    onPosted?.();
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sendable || saving.isPending) return;
        if (edit) {
          update.mutate({ id: edit.id, body }, { onSuccess });
          return;
        }
        create.mutate(
          parentId ? { body, parentId } : paragraphId ? { body, paragraphId } : { body },
          { onSuccess },
        );
      }}
    >
      <label
        htmlFor={`${id}-body`}
        className={replyTo || edit ? 'text-xs text-reader-muted' : 'sr-only'}
      >
        {label}
      </label>
      <Textarea
        id={`${id}-body`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          parentId ? m.comment_reply_placeholder() : (placeholder ?? m.comment_placeholder())
        }
        aria-describedby={`${id}-count`}
        aria-invalid={length > LIMITS.commentMax || undefined}
        autoFocus={!!parentId || !!edit}
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
        <Button type="submit" size="sm" disabled={!sendable || saving.isPending}>
          {edit ? m.comment_edit_save() : m.comment_submit()}
        </Button>
      </div>
      {saving.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {commentErrorMessage(saving.error)}
        </p>
      ) : null}
    </form>
  );
}
