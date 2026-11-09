import type { StoryCardDto } from '@novel-hub/core';
import { StoryCard } from './story-card';

/** Compact story rows inside one card, as many 330px+ columns as fit. */
export function StoryRowList({
  stories,
  priorityCount = 0,
}: {
  stories: StoryCardDto[];
  /** Covers on the first screen load eagerly. */
  priorityCount?: number;
}) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(330px,100%),1fr))] gap-1 rounded-[22px] border border-border bg-card p-2">
      {stories.map((story, index) => (
        <li key={story.publicId}>
          <StoryCard story={story} layout="row" priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
