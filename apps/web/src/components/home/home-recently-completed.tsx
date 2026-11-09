import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { StoryShelf, StoryShelfHeading } from '../story/story-shelf';
import { chapterCountMeta } from '../story/story-shelf-card';

/** Every completed story, on the search page. */
const MORE_HREF = '/search?status=completed';

/**
 * Completed stories past the home listing threshold, without those a section above already shows
 * (the page drops them). Nothing at all when no story is left.
 */
export function HomeRecentlyCompleted({ stories }: { stories: StoryCardDto[] }) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="completed-title">
      <StoryShelfHeading
        id="completed-title"
        title={m.home_completed_shelf_title()}
        more={{ href: MORE_HREF, label: m.home_completed_more() }}
      />
      <StoryShelf stories={stories} renderMeta={chapterCountMeta} />
    </section>
  );
}
