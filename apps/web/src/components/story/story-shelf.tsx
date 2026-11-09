import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { cn } from '../../lib/utils';
import { StoryShelfCard } from './story-shelf-card';

/** Written out for Tailwind. Hidden with CSS, so the HTML is the same on every device. */
const HIDE_PAST_ON_PHONES = { 5: 'max-sm:[&>li:nth-child(n+6)]:hidden' } as const;

/**
 * Story cards on shelves: a grid without column gaps so the shelf lines join up, one scrolling row
 * on phones, reaching the right edge of the screen. `limit` cuts the list the same way on the
 * server and in the browser, whichever list (with or without 18+) it is given.
 */
export function StoryShelf({
  stories,
  limit,
  mobileLimit,
  renderMeta,
}: {
  stories: StoryCardDto[];
  limit?: number;
  mobileLimit?: keyof typeof HIDE_PAST_ON_PHONES;
  renderMeta: (story: StoryCardDto) => string;
}) {
  return (
    <ul
      className={cn(
        'grid grid-cols-[repeat(auto-fill,minmax(165px,1fr))] gap-y-[34px] max-sm:-mr-4 max-sm:flex max-sm:overflow-x-auto max-sm:pb-2',
        mobileLimit && HIDE_PAST_ON_PHONES[mobileLimit],
      )}
    >
      {stories.slice(0, limit).map((story) => (
        <li key={story.publicId} className="min-w-0 max-sm:w-[150px] max-sm:shrink-0">
          <StoryShelfCard story={story} meta={renderMeta(story)} />
        </li>
      ))}
    </ul>
  );
}

/** The title of a shelf, and a link to the full list when there is one. */
export function StoryShelfHeading({
  id,
  title,
  more,
}: {
  id: string;
  title: string;
  /** `label` names the link for screen readers: the visible text is the same on every shelf. */
  more?: { href: string; label: string };
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 md:mb-6">
      <h2
        id={id}
        className="text-[29px] leading-[1.24] font-bold tracking-[-0.02em] md:text-4xl md:leading-[1.24]"
      >
        {title}
      </h2>
      {more ? (
        <a
          href={more.href}
          aria-label={more.label}
          className="font-bold whitespace-nowrap text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {m.home_section_more()}
        </a>
      ) : null}
    </div>
  );
}
