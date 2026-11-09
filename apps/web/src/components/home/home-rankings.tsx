import type { HomeRankings as HomeRankingsData } from '@novel-hub/core';
import { RANKING_PERIODS, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { TrophyIcon } from 'lucide-react';
import { useState } from 'react';
import { hasAnyRanking, pickDefaultPeriod } from '../../lib/home-rankings';
import { RankingList } from '../rankings/ranking-list';
import { RANKING_PERIOD_LABELS } from '../rankings/ranking-labels';
import { NOMINATIONS_BOARD_PATH } from '../rankings/ranking-tabs';
import { SectionHeading } from '../section-heading';
import { SEGMENTED_LIST_CLASS, segmentedLinkClass } from '../segmented-link-classes';

const FOOTER_LINK_CLASS = 'font-semibold text-primary hover:underline';

/**
 * "Rankings" on the home page: the top stories of each period, all in the HTML (never 18+), the
 * period buttons only switching which list shows. Left out when the rankings could not be read or
 * rank nothing yet; full boards stay on `/rankings/*`.
 */
export function HomeRankings({ rankings }: { rankings: HomeRankingsData }) {
  const { available, periods } = rankings;
  const [current, setCurrent] = useState(() => pickDefaultPeriod(periods));
  if (!available || !hasAnyRanking(periods)) return null;
  const stories = periods[current];
  return (
    <section aria-labelledby="rankings-title" className="flex flex-col gap-5">
      <SectionHeading
        id="rankings-title"
        icon={TrophyIcon}
        title={m.home_rankings_title()}
        subtitle={m.home_rankings_subtitle()}
      />
      <div className="max-w-full overflow-x-auto">
        <div role="group" aria-label={m.ranking_tabs_label()} className={SEGMENTED_LIST_CLASS}>
          {RANKING_PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={period === current}
              onClick={() => setCurrent(period)}
              className={segmentedLinkClass(period === current)}
            >
              {RANKING_PERIOD_LABELS[period]()}
            </button>
          ))}
        </div>
      </div>
      {stories.length > 0 ? (
        // Below the hero: no eager covers.
        <RankingList stories={stories} priority={false} />
      ) : (
        <p className="rounded-[22px] border border-border bg-card p-6 text-muted-foreground">
          {m.home_rankings_empty()}
        </p>
      )}
      <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <a href={canonicalPath({ kind: 'ranking', period: current })} className={FOOTER_LINK_CLASS}>
          {m.home_rankings_view_all({
            period: RANKING_PERIOD_LABELS[current]().toLocaleLowerCase('vi'),
          })}
        </a>
        <a href={NOMINATIONS_BOARD_PATH} className={FOOTER_LINK_CLASS}>
          {m.home_rankings_nominations()}
        </a>
      </p>
    </section>
  );
}
