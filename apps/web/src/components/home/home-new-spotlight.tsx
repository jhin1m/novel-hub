import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { StoryShelf, StoryShelfHeading } from '../story/story-shelf';
import { chapterCountMeta } from '../story/story-shelf-card';

/**
 * "New stories that need readers": the hourly rotation of new stories, without those a section
 * above already shows (the page drops them). Server-rendered only (never 18+, no client top-up);
 * nothing at all when no story is left.
 */
export function HomeNewSpotlight({ stories }: { stories: StoryCardDto[] }) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="spotlight-title">
      <StoryShelfHeading id="spotlight-title" title={m.home_spotlight_title()} />
      <StoryShelf stories={stories} renderMeta={chapterCountMeta} />
    </section>
  );
}
