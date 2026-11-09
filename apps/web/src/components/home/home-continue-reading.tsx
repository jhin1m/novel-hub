import { m } from '@novel-hub/shared/messages';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { rememberContinueRows } from '../../lib/account-hint';
import { continueRows } from '../../lib/home';
import { useHistory } from '../../lib/library';
import { useMe } from '../../lib/me';
import {
  readGuestProgress,
  removeGuestProgress,
  subscribeGuestProgress,
} from '../../lib/reader/guest-progress';
import { cn } from '../../lib/utils';
import { getGuestContinue } from '../../server-fns/reading';
import { ResumeLink } from '../library/continue-reading-button';
import { SignInPromptLink } from '../sign-in-prompt-link';
import { StoryCover } from '../story-cover';

const BAR =
  'relative z-10 flex items-center gap-3 rounded-[20px] border border-border bg-card px-3.5 py-3 md:gap-5 md:rounded-[22px] md:px-[22px] md:py-4';
const COVER_WIDTH = 'w-11 shrink-0 md:w-[54px]';
const ACTION_SIZE = 'h-11 md:h-[46px]';

/** The negative margin lives on the bar, not a wrapper: a hidden placeholder must take no room. */
const position = (overlapHero: boolean) => (overlapHero ? '-mt-[50px] md:-mt-14' : 'mt-6 md:mt-8');

/** Saved positions one lookup may find dead before it stops; the rest wait for the next load. */
const MAX_GUEST_LOOKUPS = 2;

/**
 * The first saved position that can still be shown, with its story as the server has it now:
 * nothing but the position is stored, so a story since hidden or turned 18+ never appears. Dead
 * positions are forgotten on the way. A failed request rejects and keeps the rest.
 */
async function findGuestContinueCard() {
  for (const { publicId, number, updatedAt } of readGuestProgress().slice(0, MAX_GUEST_LOOKUPS)) {
    const card = await getGuestContinue({ data: { publicId, number } });
    if (card) return card;
    removeGuestProgress(publicId, updatedAt);
  }
  return null;
}

function useGuestContinue(isGuest: boolean) {
  const items = useSyncExternalStore(subscribeGuestProgress, readGuestProgress, () => null);
  const hasSaved = (items?.length ?? 0) > 0;
  const card = useQuery({
    queryKey: ['guest-continue'],
    queryFn: findGuestContinueCard,
    enabled: isGuest && hasSaved,
    // Asked afresh on every visit; no earlier answer may stand in for it.
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // The observer keeps its data once disabled: a reader who stopped being a guest sees none of it.
  const story = isGuest && !card.isError ? card.data : null;
  const saved = story && items?.find((item) => item.publicId === story.publicId);
  return {
    loading: isGuest && (items === null || (hasSaved && card.isPending)),
    bar: story && saved ? { story, saved } : null,
  };
}

/**
 * "Continue reading" under the home hero: the reader's latest story, as one bar over the hero's
 * dark foot (`overlapHero`; a hero without a cover has none to cover). Loaded in the browser only
 * (the server never reads the session), so the cached HTML never holds it. It shows the chapter
 * number alone: numbers can skip (soft-deleted or unpublished chapters), so "chapter X of Y" or
 * "N left" would be wrong. While the account and history load, a placeholder holds its place.
 * Guests get the same bar from the position saved in this browser, plus a note saying so.
 */
export function HomeContinueReading({ overlapHero }: { overlapHero: boolean }) {
  const me = useMe();
  const history = useHistory(!!me.data);
  const rows = me.data
    ? continueRows(history.data?.pages[0]?.items ?? [], me.data.preferences.showMature === true)
    : [];
  const known = !!me.data && history.isSuccess;
  useEffect(() => {
    if (known) rememberContinueRows(rows.length);
  }, [known, rows.length]);
  // Only a confirmed guest: a failed account request is not one.
  const guest = useGuestContinue(me.isSuccess && me.data === null);

  if (me.isPending || (me.data && history.isPending) || guest.loading) {
    return <ContinueReadingPlaceholder overlapHero={overlapHero} />;
  }
  const item =
    rows[0] ??
    (guest.bar && {
      story: guest.bar.story,
      chapterNumber: guest.bar.saved.number,
      scrollPct: guest.bar.saved.scrollPct,
    });
  if (!item) return null;

  const chapter = m.chapter_number({ number: String(item.chapterNumber) });
  return (
    <aside aria-label={m.home_continue_title()} className={cn(BAR, position(overlapHero))}>
      <StoryCover
        title={item.story.title}
        authorName={item.story.author.displayName}
        mainTagSlug={item.story.mainTag.slug}
        coverUrl={item.story.coverUrl}
        sizes="(min-width: 768px) 54px, 44px"
        className={cn(COVER_WIDTH, 'rounded-[6px] md:rounded-[8px]')}
      />
      <div className="min-w-0 flex-1 lg:flex-[999_1_240px]">
        <p className="flex text-xs text-muted-foreground md:text-[13px]">
          <span className="truncate">{m.home_continue_lead()}</span>
          <span className="shrink-0 whitespace-pre md:hidden"> · {chapter}</span>
        </p>
        <p className="mt-px mb-[7px] flex font-bold md:mt-0.5 md:mb-2">
          <span className="truncate">{item.story.title}</span>
          <span className="hidden shrink-0 whitespace-pre md:inline"> · {chapter}</span>
        </p>
        <div aria-hidden className="h-[5px] max-w-[440px] rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary" style={{ width: `${item.scrollPct}%` }} />
        </div>
      </div>
      {guest.bar ? (
        <p className="hidden flex-[1_1_200px] text-[13px] text-muted-foreground lg:block">
          {m.home_continue_guest_note_lead()}{' '}
          <SignInPromptLink className="font-bold text-primary hover:underline">
            {m.home_continue_guest_note_sign_in()}
          </SignInPromptLink>{' '}
          {m.home_continue_guest_note_tail()}
        </p>
      ) : null}
      <ResumeLink
        story={item.story}
        number={item.chapterNumber}
        scrollPct={item.scrollPct}
        label={m.home_continue_action()}
        className={cn(ACTION_SIZE, 'px-4 md:px-6')}
      />
    </aside>
  );
}

/**
 * The bar's outline while it loads, so the page below does not jump once it appears. No text: it
 * is in the cached HTML for everyone. Shown before paint only when the account hint says this
 * browser's account had a bar last time, or a guest has a saved position (`.continue-hint`);
 * hidden otherwise.
 */
function ContinueReadingPlaceholder({ overlapHero }: { overlapHero: boolean }) {
  return (
    <div aria-hidden className={cn(BAR, position(overlapHero), 'continue-hint')}>
      <span
        className={cn(COVER_WIDTH, 'aspect-[2/3] rounded-[6px] bg-secondary md:rounded-[8px]')}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="h-3 w-1/3 rounded-full bg-secondary" />
        <span className="h-4 w-3/5 rounded-full bg-secondary" />
        <span className="h-[5px] max-w-[440px] rounded-full bg-secondary" />
      </span>
      <span
        className={cn(ACTION_SIZE, 'w-[84px] shrink-0 rounded-full bg-secondary md:w-[106px]')}
      />
    </div>
  );
}
