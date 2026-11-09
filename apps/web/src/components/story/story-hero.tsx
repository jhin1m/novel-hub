import type { StoryStatus } from '@novel-hub/shared';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { cn } from '../../lib/utils';
import { CoverBackdrop } from '../cover-backdrop';
import { FollowButton } from '../follow/follow-button';
import { ContinueReadingButton } from '../library/continue-reading-button';
import { LibraryButton } from '../library/library-button';
import { NominateButton } from '../nominations/nominate-button';
import { StoryCover } from '../story-cover';
import { STORY_STATUS_LABELS } from './story-labels';
import { StoryMeta } from './story-meta';

export interface StoryHeroStory {
  publicId: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  author: { username: string; displayName: string };
  mainTag: { slug: string; name: string };
  status: StoryStatus;
  chapterCount: number;
  wordCount: number;
  lastChapterAt: string | null;
  isAiAssisted: boolean;
  isMature: boolean;
}

// `currentColor`, because the hero's text colour depends on whether it sits on a cover.
const HERO_LINK =
  'rounded-sm underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current focus-visible:outline-solid';

const HERO_ACTION = 'md:h-[52px] md:px-[22px] md:text-[15px] md:has-[>svg]:px-[22px]';

/**
 * Top of the story page. With a cover it sits on that cover blurred, where every line is
 * `--cover-fg` at full strength (the scrim is only guaranteed for that colour); without one it is
 * plain page background with the text cover. One grid in DOM order (cover, title block, figures,
 * actions): the cover spans the rows on a wide screen and sits beside the title block on a narrow
 * one, with figures and actions full width below. The flexible first row keeps the text at the foot
 * of the cover.
 */
export function StoryHero({
  story,
  chaptersPerWeek,
  firstChapterNumber,
}: {
  story: StoryHeroStory;
  chaptersPerWeek: number | null;
  firstChapterNumber: number | null;
}) {
  const { coverUrl } = story;
  const onCover = coverUrl !== null;
  const tone = onCover ? 'on-cover' : 'default';
  const tagHref = canonicalPath({ kind: 'tag', slug: story.mainTag.slug });
  const details = [
    story.mainTag.name,
    STORY_STATUS_LABELS[story.status](),
    ...(story.isAiAssisted ? [m.story_shelf_ai()] : []),
    ...(story.isMature ? [m.story_card_mature()] : []),
  ].join(' · ');

  return (
    <section
      aria-labelledby="story-title"
      className={cn(
        'relative isolate',
        // `--story-tint` is the solid button's text colour (`ON_COVER_SOLID`). Only the blurred
        // image needs clipping: without it, clipping would cut the text cover's shadow.
        onCover &&
          'overflow-hidden bg-(--hero-base) text-(--cover-fg) [--story-tint:var(--hero-ink)]',
      )}
    >
      {onCover ? <CoverBackdrop coverUrl={coverUrl} eager /> : null}
      <div className="relative mx-auto max-w-[1240px] pt-4 px-safe-4 pb-[52px] md:pt-[22px] md:px-safe-8 md:pb-[104px]">
        <nav
          aria-label={m.story_page_breadcrumb()}
          className="mb-4 text-[13px] md:mb-[26px] md:text-sm"
        >
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <a href="/" className={HERO_LINK}>
                {m.nav_home()}
              </a>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <a href={tagHref} className={HERO_LINK}>
                {story.mainTag.name}
              </a>
            </li>
          </ol>
        </nav>
        <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-4 gap-y-5 md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-[1fr_auto_auto] md:gap-x-12 md:gap-y-0">
          <StoryCover
            title={story.title}
            authorName={story.author.displayName}
            mainTagSlug={story.mainTag.slug}
            coverUrl={coverUrl}
            sizes="(min-width: 768px) 240px, 132px"
            priority
            className={cn(
              'rounded-[10px] shadow-[0_12px_24px_rgba(0,0,0,0.4)] md:row-span-3 md:self-end md:rounded-[12px]',
              onCover
                ? 'md:rotate-[-2deg] md:shadow-[0_24px_50px_rgba(0,0,0,0.45)]'
                : 'md:shadow-[0_20px_44px_rgba(0,0,0,0.26)]',
            )}
          />
          <div className="flex min-w-0 flex-col items-start md:self-end">
            <p className="mb-2 text-[13px] font-semibold md:mb-3 md:text-sm">{details}</p>
            {/* Focus target once the 18+ screen goes away. */}
            <h1
              id="story-title"
              tabIndex={-1}
              className="max-w-full text-[28px] leading-[1.25] font-bold tracking-[-0.02em] text-balance wrap-break-word outline-none md:text-[clamp(40px,5vw,66px)] md:leading-[1.2]"
            >
              {story.title}
            </h1>
            <a
              href={canonicalPath({ kind: 'author', username: story.author.username })}
              className={cn(
                HERO_LINK,
                'mt-2 max-w-full truncate text-[15px] font-semibold md:mt-3.5 md:text-[17px]',
              )}
            >
              {m.story_hero_by({ name: story.author.displayName })}
            </a>
          </div>
          <div className="col-span-2 md:col-span-1 md:col-start-2 md:mt-6">
            <StoryMeta
              chapterCount={story.chapterCount}
              wordCount={story.wordCount}
              chaptersPerWeek={chaptersPerWeek}
              lastChapterAt={story.lastChapterAt}
            />
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-2.5 md:col-span-1 md:col-start-2 md:mt-[26px]">
            {/* On a narrow screen the sticky bar at the bottom carries the reading link. */}
            {firstChapterNumber !== null ? (
              <div className="hidden flex-wrap gap-2.5 md:flex">
                <ContinueReadingButton
                  story={story}
                  firstChapterNumber={firstChapterNumber}
                  size="lg"
                  showRestart
                  tone={tone}
                  className="h-[52px] px-[30px] font-extrabold has-[>svg]:px-[26px]"
                />
              </div>
            ) : null}
            <LibraryButton publicId={story.publicId} tone={tone} className={HERO_ACTION} />
            <FollowButton
              target={{ kind: 'story', publicId: story.publicId }}
              ownerUsername={story.author.username}
              tone={tone}
              className={HERO_ACTION}
            />
            <NominateButton
              publicId={story.publicId}
              ownerUsername={story.author.username}
              tone={tone}
              className={HERO_ACTION}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
