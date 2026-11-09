import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { ClockIcon } from 'lucide-react';
import { SectionHeading } from '../section-heading';
import { StoryRowList } from '../story/story-row-list';
import { Button } from '../ui/button';

/** Same order as the list here: `/search` with no keywords lists by latest update. */
const MORE_HREF = '/search?sort=updated';

/**
 * "Recently updated": a timeline, so it may repeat stories other sections show. Fewer rows on
 * phones (hidden with CSS), and a document link to the full list on the search page.
 */
export function HomeRecentUpdates({ stories }: { stories: StoryCardDto[] }) {
  return (
    <section aria-labelledby="recent-title" className="flex flex-col gap-5">
      <SectionHeading
        id="recent-title"
        icon={ClockIcon}
        title={m.home_recent()}
        subtitle={m.home_recent_subtitle()}
      />
      {stories.length > 0 ? (
        <>
          <StoryRowList stories={stories} priorityCount={4} compactOnMobile />
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <a href={MORE_HREF}>{m.home_recent_more()}</a>
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">{m.home_empty()}</p>
      )}
    </section>
  );
}
