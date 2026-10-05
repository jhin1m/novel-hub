import type { StoryCardDto } from '@novel-hub/core';
import { cn } from '../../lib/utils';
import { StoryCard } from './story-card';

/**
 * Cover cards in a grid: 2 columns on phones, then as many 160px+ columns as fit. With `scroll`,
 * phones get one horizontally scrolling row of 140px cards instead.
 */
export function StoryGrid({
  stories,
  priorityCount = 0,
  scroll = false,
}: {
  stories: StoryCardDto[];
  /** Covers on the first screen load eagerly. */
  priorityCount?: number;
  scroll?: boolean;
}) {
  return (
    <ul
      className={cn(
        'grid gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]',
        scroll ? 'max-sm:flex max-sm:gap-4 max-sm:overflow-x-auto max-sm:pb-2' : 'grid-cols-2',
      )}
    >
      {stories.map((story, index) => (
        <li key={story.publicId} className={cn(scroll && 'max-sm:w-[140px] max-sm:shrink-0')}>
          <StoryCard story={story} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
