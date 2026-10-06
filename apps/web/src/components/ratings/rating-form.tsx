import type { MyRatingDto } from '@novel-hub/core';
import { LIMITS, plainTextLength } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api-errors';
import { useMe } from '@/lib/me';
import { useDeleteRating, useMyRating, useSaveRating } from '@/lib/ratings';
import { ConfirmDialog } from '../moderation/confirm-dialog';
import { StarInput } from './star-input';

/**
 * Where the reader rates the story. What shows depends on the account: guests get a sign-in link,
 * an unverified email a reminder, a muted account a notice, the story's author nothing (they do not
 * rate their own story); only an account allowed to post (the rule of `canPostCommunityContent`,
 * checked again on the server) gets the form, filled with their earlier rating.
 */
export function RatingForm({
  publicId,
  authorUsername,
}: {
  publicId: string;
  authorUsername: string;
}) {
  const me = useMe();
  const allowed =
    !!me.data &&
    me.data.status === 'active' &&
    me.data.emailVerified &&
    me.data.username !== authorUsername;
  const mine = useMyRating(publicId, allowed);

  if (me.isPending || !me.data) {
    return me.isPending ? null : (
      <p className="text-sm text-muted-foreground">
        <Link to="/sign-in" className="font-bold text-primary hover:underline">
          {m.rating_sign_in()}
        </Link>{' '}
        {m.rating_sign_in_prompt()}
      </p>
    );
  }
  if (me.data.username === authorUsername) return null;
  if (me.data.status === 'muted') {
    return <p className="text-sm text-muted-foreground">{m.rating_muted()}</p>;
  }
  if (!me.data.emailVerified) {
    return <p className="text-sm text-muted-foreground">{m.rating_verify_prompt()}</p>;
  }
  if (mine.isPending) return null;
  if (mine.isError) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        {m.rating_load_error()}
      </p>
    );
  }
  // The fields start from the saved rating; later refetches (after a save) leave them as typed.
  return <RatingFields publicId={publicId} mine={mine.data} />;
}

function RatingFields({ publicId, mine }: { publicId: string; mine: MyRatingDto | null }) {
  const id = useId();
  const [score, setScore] = useState<number | null>(mine?.score ?? null);
  const [review, setReview] = useState(mine?.review ?? '');
  const save = useSaveRating(publicId);
  const remove = useDeleteRating(publicId);
  const hidden = mine?.status === 'hidden_by_mod';
  const length = plainTextLength(review.trim());
  const busy = save.isPending || remove.isPending;
  const error = save.error ?? remove.error;

  return (
    <form
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-[18px] bg-secondary/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (score === null || busy || hidden || length > LIMITS.reviewMax) return;
        remove.reset();
        save.mutate({ score, review });
      }}
    >
      <h3 id={`${id}-title`} className="font-bold">
        {m.rating_form_title()}
      </h3>
      {hidden ? <p className="text-sm text-muted-foreground">{m.rating_hidden()}</p> : null}
      <StarInput value={score} onChange={setScore} disabled={hidden || busy} />
      <label htmlFor={`${id}-review`} className="text-sm font-semibold">
        {m.rating_review_label()}
      </label>
      <Textarea
        id={`${id}-review`}
        value={review}
        onChange={(e) => setReview(e.target.value)}
        placeholder={m.rating_review_placeholder()}
        aria-describedby={`${id}-count`}
        aria-invalid={length > LIMITS.reviewMax || undefined}
        disabled={hidden}
        className="max-h-96 min-h-24"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p
          id={`${id}-count`}
          className={
            length > LIMITS.reviewMax
              ? 'mr-auto text-xs text-destructive'
              : 'mr-auto text-xs text-muted-foreground'
          }
        >
          {m.rating_char_count({ count: length, max: LIMITS.reviewMax })}
        </p>
        {mine && !hidden ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" size="sm" disabled={busy}>
                {m.rating_delete()}
              </Button>
            }
            title={m.rating_delete_title()}
            description={m.rating_delete_description()}
            onConfirm={() => {
              save.reset();
              remove.mutate(undefined, {
                onSuccess: () => {
                  setScore(null);
                  setReview('');
                },
              });
            }}
          />
        ) : null}
        {hidden ? null : (
          <Button
            type="submit"
            size="sm"
            disabled={score === null || busy || length > LIMITS.reviewMax}
          >
            {m.rating_save()}
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error)}
        </p>
      ) : save.isSuccess ? (
        <p role="status" className="text-sm text-muted-foreground">
          {m.rating_saved()}
        </p>
      ) : null}
    </form>
  );
}
