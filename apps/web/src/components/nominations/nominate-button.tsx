import { m } from '@novel-hub/shared/messages';
import { AwardIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, apiErrorMessage } from '@/lib/api-errors';
import { useMe } from '@/lib/me';
import { useNominate, useNominationStatus } from '@/lib/nominations';
import { cn } from '@/lib/utils';
import { SignInPromptLink } from '../sign-in-prompt-link';
import { ON_COVER_OUTLINE } from '../story/on-cover-classes';
import { nominateButtonView } from './nominate-button-view';

/**
 * "Nominate" a story with one of the reader's free weekly nominations. Same rendering rules as the
 * follow button: the server renders a neutral, disabled button and the reader's state loads in the
 * browser; guests are sent to sign in and the author sees nothing. The line beside it says how many
 * nominations are left, or why the reader cannot nominate.
 */
export function NominateButton({
  publicId,
  ownerUsername,
  tone = 'default',
}: {
  publicId: string;
  /** Username of the story's author, who cannot nominate it. */
  ownerUsername: string;
  tone?: 'default' | 'on-cover';
}) {
  const me = useMe();
  const signedIn = !!me.data;
  const isOwner = me.data?.username === ownerUsername;
  const status = useNominationStatus(publicId, signedIn && !isOwner);
  const nominate = useNominate(publicId);
  const view = nominateButtonView({
    meUnknown: me.isPending || me.isError,
    signedIn,
    isOwner,
    status: status.data,
    statusNotFound: status.error instanceof ApiError && status.error.code === 'NOT_FOUND',
  });
  const buttonClass = cn(tone === 'on-cover' && ON_COVER_OUTLINE);
  const noteClass = cn('text-sm font-semibold', tone === 'default' && 'text-muted-foreground');

  switch (view.kind) {
    case 'hidden':
      return null;
    case 'pending':
      return (
        <Button variant="outline" className={buttonClass} disabled>
          <AwardIcon aria-hidden />
          {view.label}
        </Button>
      );
    case 'guest':
      return (
        <Button asChild variant="outline" className={buttonClass}>
          <SignInPromptLink reason="nominate">
            <AwardIcon aria-hidden />
            {view.label}
          </SignInPromptLink>
        </Button>
      );
    case 'disabled':
    case 'active': {
      const message = nominate.isSuccess
        ? m.nominate_success({ count: String(nominate.data.remaining) })
        : view.note;
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            variant="outline"
            className={buttonClass}
            disabled={view.kind === 'disabled' || nominate.isPending}
            onClick={() => nominate.mutate()}
          >
            <AwardIcon aria-hidden />
            {view.label}
          </Button>
          {nominate.isError ? (
            <p role="alert" className={noteClass}>
              {apiErrorMessage(nominate.error)}
            </p>
          ) : message ? (
            <p role="status" className={noteClass}>
              {message}
            </p>
          ) : null}
        </div>
      );
    }
  }
}
