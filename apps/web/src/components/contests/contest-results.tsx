import type { StoryCardDto } from '@novel-hub/core';
import type { ContestPlacement } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { TrophyIcon } from 'lucide-react';
import { SectionHeading } from '../section-heading';
import { StoryCard } from '../story/story-card';

/** "Results": the placed entries of an ended contest, by place. Nothing until a place is awarded. */
export function ContestResults({
  winners,
}: {
  winners: Array<{ placement: ContestPlacement; story: StoryCardDto }>;
}) {
  if (winners.length === 0) return null;
  return (
    <section aria-labelledby="contest-results" className="flex flex-col gap-5">
      <SectionHeading id="contest-results" icon={TrophyIcon} title={m.contest_results_title()} />
      <ol className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
        {winners.map(({ placement, story }) => (
          <li key={story.publicId} className="flex flex-col gap-2">
            <span className="text-sm font-bold text-primary">
              {m.contest_placement({ placement: String(placement) })}
            </span>
            <StoryCard story={story} priority />
          </li>
        ))}
      </ol>
    </section>
  );
}
