import type { StoryCardDto } from '@novel-hub/core';
import { cn } from '../../lib/utils';
import { StoryCard } from './story-card';

/** Compact story rows inside one card, as many 330px+ columns as fit. */
export function StoryRowList({
  stories,
  priorityCount = 0,
  compactOnMobile = false,
}: {
  stories: StoryCardDto[];
  /** Covers on the first screen load eagerly. */
  priorityCount?: number;
  /**
   * Below `md`, only the first 6 rows show. Hidden with CSS, so the HTML is the same on every
   * device (one cached page); Tailwind needs the class written out.
   */
  compactOnMobile?: boolean;
}) {
  return (
    <ul
      className={cn(
        'grid grid-cols-[repeat(auto-fill,minmax(min(330px,100%),1fr))] gap-1 rounded-[22px] border border-border bg-card p-2',
        compactOnMobile && 'max-md:[&>li:nth-child(n+7)]:hidden',
      )}
    >
      {stories.map((story, index) => (
        <li key={story.publicId}>
          <StoryCard story={story} layout="row" priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
