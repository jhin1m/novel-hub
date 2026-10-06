import { RANKING_PERIODS, type RankingPeriod, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { SEGMENTED_LIST_CLASS, segmentedLinkClass } from '../segmented-link-classes';
import { RANKING_PERIOD_LABELS } from './ranking-labels';

/**
 * Pill tabs of the four periods. Plain document links, so every ranking page comes from the
 * CDN-cached HTML.
 */
export function RankingTabs({ current }: { current: RankingPeriod }) {
  return (
    <nav aria-label={m.ranking_tabs_label()} className="max-w-full overflow-x-auto">
      <ul className={SEGMENTED_LIST_CLASS}>
        {RANKING_PERIODS.map((period) => (
          <li key={period}>
            <a
              href={canonicalPath({ kind: 'ranking', period })}
              aria-current={period === current ? 'page' : undefined}
              className={segmentedLinkClass(period === current)}
            >
              {RANKING_PERIOD_LABELS[period]()}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
