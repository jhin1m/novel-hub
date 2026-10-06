import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { cn } from '../../lib/utils';
import { StoryCard } from '../story/story-card';

/**
 * A ranking: a large rank number on the left of each compact story row, best first. The score is
 * never shown, only the order.
 */
export function RankingList({ stories }: { stories: StoryCardDto[] }) {
  return (
    <ol className="grid gap-1 rounded-[22px] border border-border bg-card p-2 lg:grid-cols-2">
      {stories.map((story, index) => (
        <li key={story.publicId} className="flex items-center gap-1">
          <span className="sr-only">{m.ranking_rank({ rank: String(index + 1) })}</span>
          <span
            aria-hidden="true"
            className={cn(
              'w-11 shrink-0 text-center font-serif text-[28px] leading-none font-bold tabular-nums',
              index < 3 ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <StoryCard story={story} layout="row" priority={index < 4} />
          </div>
        </li>
      ))}
    </ol>
  );
}
