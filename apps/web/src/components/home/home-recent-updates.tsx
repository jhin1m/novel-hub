import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { ClockIcon } from 'lucide-react';
import { SectionHeading } from '../section-heading';
import { StoryGrid } from '../story/story-grid';
import { StoryRowList } from '../story/story-row-list';
import { Button } from '../ui/button';

/** Same order as the list here: `/search` with no keywords lists by latest update. */
const MORE_HREF = '/search?sort=updated';
const COVER_COUNT = 6;
const ROW_COUNT = 12;

/**
 * "Recently updated": a timeline, so it may repeat stories other sections show. The latest few as
 * cover cards, the next ones as compact rows (fewer on phones, hidden with CSS), and a document
 * link to the full list on the search page. Below the hero: no eager covers.
 */
export function HomeRecentUpdates({ stories }: { stories: StoryCardDto[] }) {
  const rows = stories.slice(COVER_COUNT, COVER_COUNT + ROW_COUNT);
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
          <StoryGrid stories={stories.slice(0, COVER_COUNT)} scroll showLatestChapter />
          {rows.length > 0 ? <StoryRowList stories={rows} compactOnMobile /> : null}
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
