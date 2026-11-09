import type { ExploreEntry, StoryCardDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { BookCheckIcon, type LucideIcon, SproutIcon, TrophyIcon } from 'lucide-react';
import { searchHref } from '@/lib/search';
import { SectionHeading } from '../section-heading';
import { StoryGrid } from '../story/story-grid';

/**
 * Short rows opening the explore page before any filter is picked: the week's most read, the
 * recently completed and the new stories that need readers. Server-rendered, never 18+ (no client
 * top-up); a row with no story is left out.
 */
export function ExploreEntryRows({ entry }: { entry: ExploreEntry }) {
  return (
    <nav aria-label={m.explore_entry_label()} className="flex flex-col gap-10">
      <EntryRow
        id="explore-ranking"
        icon={TrophyIcon}
        title={m.explore_entry_week_ranking()}
        stories={entry.ranking.available ? entry.ranking.stories : []}
        moreHref={canonicalPath({ kind: 'ranking', period: 'week' })}
      />
      <EntryRow
        id="explore-completed"
        icon={BookCheckIcon}
        title={m.home_completed_title()}
        stories={entry.completed}
        moreHref={searchHref({ q: '', noAi: false, page: 1, status: 'completed' })}
      />
      <EntryRow
        id="explore-spotlight"
        icon={SproutIcon}
        title={m.home_spotlight_title()}
        stories={entry.spotlight}
      />
    </nav>
  );
}

function EntryRow({
  id,
  icon,
  title,
  stories,
  moreHref,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  stories: StoryCardDto[];
  /** "See all" link; a document link, as the lists it leads to are cached HTML or a new search. */
  moreHref?: string;
}) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <SectionHeading id={id} icon={icon} title={title} />
        {moreHref ? (
          <a
            href={moreHref}
            aria-describedby={id}
            className="shrink-0 rounded-md text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {m.explore_entry_view_all()}
          </a>
        ) : null}
      </div>
      <StoryGrid stories={stories} scroll />
    </section>
  );
}
