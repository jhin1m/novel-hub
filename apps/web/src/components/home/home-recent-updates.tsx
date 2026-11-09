import type { StoryCardDto } from '@novel-hub/core';
import { HOME_RECENT_LIMIT } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { StoryShelf, StoryShelfHeading } from '../story/story-shelf';
import { chapterCountMeta } from '../story/story-shelf-card';

/** Same order as the list here: `/search` with no keywords lists by latest update. */
const MORE_HREF = '/search?sort=updated';

function latestChapterMeta(story: StoryCardDto): string {
  if (!story.latestChapter) return chapterCountMeta(story);
  const chapter = m.chapter_number({ number: String(story.latestChapter.number) });
  return `${chapter} · ${story.mainTag.name}`;
}

/**
 * "Just got a new chapter": a timeline, so it may repeat stories other sections show. Always the
 * same number of covers, including when an account allowing 18+ swaps in the longer API list.
 */
export function HomeRecentUpdates({ stories }: { stories: StoryCardDto[] }) {
  return (
    <section aria-labelledby="recent-title" className="min-w-0 flex-[999_1_560px]">
      <StoryShelfHeading
        id="recent-title"
        title={m.home_recent()}
        more={stories.length > 0 ? { href: MORE_HREF, label: m.home_recent_more() } : undefined}
      />
      {stories.length > 0 ? (
        <StoryShelf
          stories={stories}
          limit={HOME_RECENT_LIMIT}
          mobileLimit={5}
          renderMeta={latestChapterMeta}
        />
      ) : (
        <p className="text-muted-foreground">{m.home_empty()}</p>
      )}
    </section>
  );
}
