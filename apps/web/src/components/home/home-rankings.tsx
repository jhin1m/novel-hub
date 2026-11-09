import type { HomeRankings as HomeRankingsData, StoryCardDto } from '@novel-hub/core';
import { RANKING_PERIODS, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useState } from 'react';
import { hasAnyRanking, pickDefaultPeriod } from '../../lib/home-rankings';
import { cn } from '../../lib/utils';
import { RANKING_PERIOD_LABELS } from '../rankings/ranking-labels';
import { StoryCover } from '../story-cover';
import { STORY_STATUS_LABELS } from '../story/story-labels';
import { StoryMetaLine } from '../story/story-shelf-card';

function RankedStory({ story, rank }: { story: StoryCardDto; rank: number }) {
  const href = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });
  return (
    <li className="group relative flex items-center gap-3 border-t border-band py-2.5 md:gap-3.5 md:py-[11px]">
      <span className="sr-only">{m.ranking_rank({ rank: String(rank) })}</span>
      <span
        aria-hidden="true"
        className={cn(
          'w-7 shrink-0 text-center text-[30px] leading-none font-bold tabular-nums md:w-[34px] md:text-[34px]',
          rank <= 3 ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {rank}
      </span>
      {/* Below the hero: no eager covers. */}
      <StoryCover
        title={story.title}
        authorName={story.author.displayName}
        mainTagSlug={story.mainTag.slug}
        coverUrl={story.coverUrl}
        sizes="50px"
        className="w-11 shrink-0 rounded-[6px] md:w-[50px]"
      />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-[15px] leading-[1.3] font-bold">
          <a
            href={href}
            className="underline-offset-4 outline-none group-hover:underline after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-ring"
          >
            {story.title}
          </a>
        </h3>
        <StoryMetaLine
          story={story}
          text={`${story.mainTag.name} · ${STORY_STATUS_LABELS[story.status]()}`}
          className="mt-0.5 text-[13px] md:mt-[3px]"
        />
      </div>
    </li>
  );
}

/**
 * "Being read the most" on the home page: every period is in the HTML (never 18+), the period
 * buttons only switching which list shows. Phones get the top three of the opening period, with
 * CSS, so the HTML stays the same. Left out when the rankings could not be read or rank nothing
 * yet, and the shelf next to it then takes the whole row; full boards stay on `/rankings/*`.
 */
export function HomeRankings({ rankings }: { rankings: HomeRankingsData }) {
  const { available, periods } = rankings;
  const [current, setCurrent] = useState(() => pickDefaultPeriod(periods));
  if (!available || !hasAnyRanking(periods)) return null;
  const stories = periods[current];
  return (
    <section
      aria-labelledby="rankings-title"
      className="min-w-0 flex-[1_1_320px] rounded-[22px] border border-border bg-card p-[18px] md:rounded-[24px] md:p-6"
    >
      <h2
        id="rankings-title"
        className="text-[25px] leading-[1.2] font-bold max-md:mb-1.5 md:text-[28px] md:leading-[1.2]"
      >
        {m.home_rankings_title()}
      </h2>
      <div
        role="group"
        aria-label={m.ranking_tabs_label()}
        className="mt-3.5 mb-3 hidden gap-1 rounded-full bg-band p-1 md:flex"
      >
        {RANKING_PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={period === current}
            onClick={() => setCurrent(period)}
            className={cn(
              'h-[38px] min-w-0 flex-1 rounded-full text-sm whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
              period === current
                ? 'bg-card font-bold text-foreground'
                : 'font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            {RANKING_PERIOD_LABELS[period]()}
          </button>
        ))}
      </div>
      {stories.length > 0 ? (
        <ol className="max-md:[&>li:nth-child(n+4)]:hidden">
          {stories.map((story, index) => (
            <RankedStory key={story.publicId} story={story} rank={index + 1} />
          ))}
        </ol>
      ) : (
        <p className="border-t border-band py-4 text-muted-foreground">{m.home_rankings_empty()}</p>
      )}
      <a
        href={canonicalPath({ kind: 'ranking', period: current })}
        className="mt-1 inline-block py-2.5 font-bold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring md:mt-3"
      >
        {m.home_rankings_view_all({
          period: RANKING_PERIOD_LABELS[current]().toLocaleLowerCase('vi'),
        })}
      </a>
    </section>
  );
}
