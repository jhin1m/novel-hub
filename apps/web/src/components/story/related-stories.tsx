import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { useQuery } from '@tanstack/react-query';
import { useId, useRef } from 'react';
import { createApiClient } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import { useNearViewport } from '@/lib/use-near-viewport';
import { cn } from '@/lib/utils';
import { SectionHeading } from '../section-heading';
import { StoryShelfCard } from './story-shelf-card';

const api = createApiClient();

const RELATED_LIMIT = 6;

/** The author's stories first, then the same main tag's, each story once. */
export function pickRelatedStories(related: {
  sameAuthor: StoryCardDto[];
  sameMainTag: StoryCardDto[];
}): StoryCardDto[] {
  const all = [...related.sameAuthor, ...related.sameMainTag];
  // A `Map` keeps each key where it was first inserted.
  return [...new Map(all.map((story) => [story.publicId, story])).values()].slice(0, RELATED_LIMIT);
}

/**
 * "Related stories" in the story page sidebar, as a shelf of three columns: the author's other
 * stories, then stories of the same main tag. Loaded in the browser from `/api/v1` once the reader
 * scrolls near it (at once on a wide screen, below the story on a narrow one): the page HTML is
 * cached for a day and never purged when another story changes, so it lists none. Left out when
 * empty or the load failed: it is a suggestion, not something the reader asked for. Nothing loads
 * while `enabled` is false (the 18+ screen is up).
 */
export function RelatedStories({ publicId, enabled }: { publicId: string; enabled: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref, enabled);
  const related = useQuery({
    queryKey: ['related-stories', publicId],
    queryFn: async () => {
      const res = await api.api.v1.stories[':publicId'].related.$get({ param: { publicId } });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    enabled: enabled && near,
    staleTime: 5 * 60_000,
  });
  const stories = related.data ? pickRelatedStories(related.data) : [];

  return (
    // Hidden once settled with nothing to show, so it leaves no gap in the sidebar column.
    <div ref={ref} className={cn(related.isFetched && stories.length === 0 && 'hidden')}>
      {stories.length > 0 ? (
        <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
          <SectionHeading id={`${id}-heading`} title={m.related_heading()} />
          <div className="grid max-w-[420px] grid-cols-3 gap-y-[22px]">
            {stories.map((story) => (
              <StoryShelfCard key={story.publicId} story={story} compact />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
