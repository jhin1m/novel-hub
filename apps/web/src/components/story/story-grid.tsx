import type { StoryCardDto } from '@novel-hub/core';
import { StoryCard } from './story-card';

/** Cards in a grid: 2 columns on phones up to 6 on wide screens. */
export function StoryGrid({
  stories,
  priorityCount = 0,
}: {
  stories: StoryCardDto[];
  /** Covers on the first screen load eagerly. */
  priorityCount?: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {stories.map((story, index) => (
        <li key={story.publicId}>
          <StoryCard story={story} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
