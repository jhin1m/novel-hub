import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { StoryShelf, StoryShelfHeading } from '../story/story-shelf';
import { chapterCountMeta } from '../story/story-shelf-card';

/** "Featured stories": the moderators' picks running now; nothing at all without one. */
export function HomeFeaturedPicks({ stories }: { stories: StoryCardDto[] }) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="picks-title">
      <StoryShelfHeading id="picks-title" title={m.home_picks_title()} />
      <StoryShelf stories={stories} renderMeta={chapterCountMeta} />
    </section>
  );
}
