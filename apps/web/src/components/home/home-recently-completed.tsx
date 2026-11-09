import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { BookCheckIcon } from 'lucide-react';
import { SectionHeading } from '../section-heading';
import { StoryGrid } from '../story/story-grid';
import { Button } from '../ui/button';

/** Every completed story, on the search page. */
const MORE_HREF = '/search?status=completed';

/**
 * "Recently completed": completed stories past the home listing threshold, without those a section
 * above already shows (the page drops them). Nothing at all when no story is left.
 */
export function HomeRecentlyCompleted({ stories }: { stories: StoryCardDto[] }) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="completed-title" className="flex flex-col gap-5">
      <SectionHeading
        id="completed-title"
        icon={BookCheckIcon}
        title={m.home_completed_title()}
        subtitle={m.home_completed_subtitle()}
      />
      <StoryGrid stories={stories} scroll />
      <div className="flex justify-center">
        <Button asChild variant="outline">
          <a href={MORE_HREF}>{m.home_completed_more()}</a>
        </Button>
      </div>
    </section>
  );
}
