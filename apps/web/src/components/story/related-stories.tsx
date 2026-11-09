import type { StoryCardDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { useQuery } from '@tanstack/react-query';
import { LibraryBigIcon } from 'lucide-react';
import { useId, useRef } from 'react';
import { createApiClient } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import { useNearViewport } from '@/lib/use-near-viewport';
import { cn } from '@/lib/utils';
import { SectionHeading } from '../section-heading';
import { StoryRowList } from './story-row-list';

const api = createApiClient();

/**
 * "Related stories" in the story page sidebar, as compact rows: the author's other stories, then
 * stories of the same main tag. Loaded in the browser from `/api/v1` once the reader scrolls near
 * it (at once on a wide screen, below the story on a narrow one): the page HTML is cached for a day
 * and never purged when another story changes, so it lists none. Empty groups are left out, and
 * the whole section when both are empty or the load failed: it is a suggestion, not something the
 * reader asked for. Nothing loads while `enabled` is false (the 18+ screen is up).
 */
export function RelatedStories({
  publicId,
  mainTagName,
  enabled,
}: {
  publicId: string;
  mainTagName: string;
  enabled: boolean;
}) {
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
  const groups = related.data
    ? [
        { key: 'author', title: m.related_same_author(), stories: related.data.sameAuthor },
        {
          key: 'tag',
          title: m.related_same_tag({ tag: mainTagName }),
          stories: related.data.sameMainTag,
        },
      ].filter((g) => g.stories.length > 0)
    : [];

  return (
    // Hidden once settled with nothing to show, so it leaves no gap in the sidebar column.
    <div ref={ref} className={cn(related.isFetched && groups.length === 0 && 'hidden')}>
      {groups.length > 0 ? (
        <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
          <SectionHeading id={`${id}-heading`} icon={LibraryBigIcon} title={m.related_heading()} />
          {groups.map((group) => (
            <RelatedGroup
              key={group.key}
              id={`${id}-${group.key}`}
              title={group.title}
              stories={group.stories}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function RelatedGroup({
  id,
  title,
  stories,
}: {
  id: string;
  title: string;
  stories: StoryCardDto[];
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="px-1 text-[15px] font-bold tracking-tight">
        {title}
      </h3>
      <StoryRowList stories={stories} />
    </section>
  );
}
