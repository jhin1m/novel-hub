import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { SproutIcon } from 'lucide-react';
import { SectionHeading } from '../section-heading';
import { StoryGrid } from '../story/story-grid';

/**
 * "New stories that need readers": the hourly rotation of new stories, without those a section
 * above already shows (the page drops them). Server-rendered only (never 18+, no client top-up);
 * nothing at all when no story is left.
 */
export function HomeNewSpotlight({ stories }: { stories: StoryCardDto[] }) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="spotlight-title" className="flex flex-col gap-5">
      <SectionHeading
        id="spotlight-title"
        icon={SproutIcon}
        title={m.home_spotlight_title()}
        subtitle={m.home_spotlight_subtitle()}
      />
      <StoryGrid stories={stories} scroll />
    </section>
  );
}
