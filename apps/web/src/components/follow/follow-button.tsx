import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { BellPlusIcon, BellRingIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type FollowTarget, useFollowing, useSetFollowing } from '@/lib/follows';
import { useMe } from '@/lib/me';
import { cn } from '@/lib/utils';
import { ON_COVER_OUTLINE, ON_COVER_SOLID } from '../story/on-cover-classes';
import { followButtonView } from './follow-button-view';

/**
 * "Follow" for a story or an author. The server renders the neutral, disabled button (the page is
 * cached publicly); the reader's own state loads in the browser. Guests are sent to sign in, and
 * the owner (the author of the story, or the author themselves) sees no button. A toggle: the label
 * stays, `aria-pressed` and the filled look say whether it is on. `tone="on-cover"` is for the
 * cover-coloured story hero.
 */
export function FollowButton({
  target,
  ownerUsername,
  tone = 'default',
  className,
}: {
  target: FollowTarget;
  /** Username of whoever cannot follow this target (its author). */
  ownerUsername: string;
  tone?: 'default' | 'on-cover';
  className?: string;
}) {
  const me = useMe();
  const signedIn = !!me.data;
  const isOwner = me.data?.username === ownerUsername;
  const following = useFollowing(target, signedIn && !isOwner);
  const setFollowing = useSetFollowing();

  const label = m.follow_button();
  const off = cn(tone === 'on-cover' && ON_COVER_OUTLINE, className);
  const view = followButtonView({
    meUnknown: me.isPending || me.isError,
    signedIn,
    isOwner,
    followingPending: following.isPending,
    following: following.data,
  });

  switch (view) {
    case 'hidden':
      return null;
    case 'pending':
      return (
        <Button variant="outline" className={off} disabled>
          <BellPlusIcon aria-hidden />
          {label}
        </Button>
      );
    case 'guest':
      return (
        <Button asChild variant="outline" className={off}>
          <Link to="/sign-in">
            <BellPlusIcon aria-hidden />
            {label}
          </Link>
        </Button>
      );
    case 'on':
    case 'off': {
      const on = view === 'on';
      return (
        <Button
          variant={on ? 'default' : 'outline'}
          aria-pressed={on}
          className={cn(tone === 'on-cover' && (on ? ON_COVER_SOLID : ON_COVER_OUTLINE), className)}
          disabled={setFollowing.isPending}
          onClick={() => setFollowing.mutate({ target, following: !on })}
        >
          {on ? <BellRingIcon aria-hidden /> : <BellPlusIcon aria-hidden />}
          {label}
        </Button>
      );
    }
  }
}
