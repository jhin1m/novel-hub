import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { AwardIcon } from 'lucide-react';
import { SectionHeading } from '../section-heading';
import { StoryGrid } from '../story/story-grid';

/** "Featured stories": the moderators' picks running now, under the hero row of the home page. */
export function HomeFeaturedPicks({ stories }: { stories: StoryCardDto[] }) {
  return (
    <section aria-labelledby="picks-title" className="flex flex-col gap-5">
      <SectionHeading
        id="picks-title"
        icon={AwardIcon}
        title={m.home_picks_title()}
        subtitle={m.home_picks_subtitle()}
      />
      <StoryGrid stories={stories} scroll />
    </section>
  );
}
