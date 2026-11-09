import type { HomeHero } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { cn } from '../../lib/utils';
import { CoverBackdrop } from '../cover-backdrop';
import { LibraryButton } from '../library/library-button';
import { ON_COVER_SOLID } from '../story/on-cover-classes';
import { StoryCover } from '../story-cover';
import { Button } from '../ui/button';

/*
 * One DOM for the cover, moved by grid areas: beside the title on a phone, a full-height column
 * from `md`. The empty `1fr` rows take the height a spanning cover would otherwise spread over the
 * text rows, which keeps the text together and centred against it.
 */
const PHONE_AREAS =
  "grid-cols-[88px_minmax(0,1fr)] [grid-template-areas:'label_label'_'cover_title'_'syn_syn'_'cta_cta']";
const COVER_RIGHT =
  "md:grid-cols-[minmax(0,1fr)_auto] md:[grid-template-areas:'._cover'_'label_cover'_'title_cover'_'syn_cover'_'cta_cover'_'._cover']";
const COVER_LEFT =
  "md:grid-cols-[auto_minmax(0,1fr)] md:[grid-template-areas:'cover_.'_'cover_label'_'cover_title'_'cover_syn'_'cover_cta'_'cover_.']";

/**
 * The home hero: one notable story, from the public list in the loader, so it is the same in the
 * cached HTML and after hydration and never 18+. With a cover it sits on that cover blurred, where
 * every line is `--cover-fg` at full strength (the scrim is only guaranteed for that colour).
 * Without one there is nothing to blur, so it is plain page background with the text cover.
 */
export function HomeFeaturedHero({ story }: { story: HomeHero }) {
  const { slug, publicId, coverUrl } = story;
  const storyHref = canonicalPath({ kind: 'story', slug, publicId });
  const readHref =
    story.firstChapterNumber === null
      ? storyHref
      : canonicalPath({ kind: 'chapter', slug, publicId, number: story.firstChapterNumber });
  const chapterCount = m.story_card_chapters({ count: String(story.chapterCount) });
  const onCover = coverUrl !== null;

  return (
    <section
      aria-labelledby="featured-title"
      className={cn(
        'relative isolate',
        // `--story-tint` is the solid button's text colour (`ON_COVER_SOLID`). Only the blurred
        // image needs clipping: without it, clipping would cut the text cover's shadow.
        onCover &&
          'overflow-hidden bg-(--hero-base) text-(--cover-fg) [--story-tint:var(--hero-ink)]',
      )}
    >
      {onCover ? <CoverBackdrop coverUrl={coverUrl} eager /> : null}
      <div
        className={cn(
          'relative mx-auto grid max-w-[1240px] items-center gap-x-3.5 pt-[26px] px-safe-4 md:grid-rows-[1fr_repeat(4,auto)_1fr] md:gap-x-10 md:pt-[clamp(40px,6vw,72px)] md:px-safe-8 lg:gap-x-[72px]',
          PHONE_AREAS,
          onCover ? cn(COVER_RIGHT, 'pb-[78px] md:pb-28') : COVER_LEFT,
        )}
      >
        <p className="mb-3.5 text-[13px] font-semibold [grid-area:label] md:mb-[22px] md:text-sm">
          {m.home_featured_label()} · {story.mainTag.name}
          <span className="hidden md:inline"> · {chapterCount}</span>
        </p>
        <div className="min-w-0 [grid-area:title]">
          {/* Clamping clips at the box: the padding keeps stacked marks (Ẩ, Ỗ) on the first line. */}
          <h2
            id="featured-title"
            className="-mt-[0.2em] line-clamp-3 pt-[0.2em] text-[27px] leading-[1.25] font-bold tracking-[-0.02em] wrap-anywhere md:text-[clamp(36px,4.6vw,62px)] md:leading-[1.2]"
          >
            <a
              href={storyHref}
              className="underline-offset-4 outline-none hover:underline focus-visible:underline"
            >
              {story.title}
            </a>
          </h2>
          <p className="mt-1.5 text-sm md:mt-3 md:text-[17px] md:font-semibold">
            <span className="md:hidden">
              {story.author.displayName} · {chapterCount}
            </span>
            <span className="hidden md:inline">
              {m.home_featured_by({ name: story.author.displayName })}
            </span>
          </p>
        </div>
        {story.synopsis ? (
          <p className="mt-4 line-clamp-3 max-w-[56ch] text-[15px] leading-[1.6] [grid-area:syn] md:mt-5 md:text-lg md:leading-[1.65]">
            {story.synopsis}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3 [grid-area:cta] md:mt-8">
          <Button
            asChild
            className={cn(
              'px-[22px] text-base font-extrabold md:h-[52px] md:px-7',
              onCover && ON_COVER_SOLID,
            )}
          >
            <a href={readHref}>{m.home_featured_view()}</a>
          </Button>
          <LibraryButton
            publicId={publicId}
            tone={onCover ? 'on-cover' : 'default'}
            className="hidden h-[52px] px-[26px] text-[15px] has-[>svg]:px-[22px] md:inline-flex"
          />
        </div>
        <StoryCover
          title={story.title}
          authorName={story.author.displayName}
          mainTagSlug={story.mainTag.slug}
          coverUrl={coverUrl}
          sizes="(min-width: 768px) 290px, 88px"
          priority
          className={cn(
            'w-[88px] rounded-[8px] shadow-[0_12px_24px_rgba(0,0,0,0.4)] [grid-area:cover] md:w-[290px] md:rounded-[12px]',
            onCover
              ? 'md:rotate-[-2.5deg] md:shadow-[0_26px_54px_rgba(0,0,0,0.45)]'
              : 'md:shadow-[0_20px_44px_rgba(0,0,0,0.26)]',
          )}
        />
      </div>
    </section>
  );
}
