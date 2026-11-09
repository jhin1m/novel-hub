import { RANKING_PERIODS, type RankingPeriod, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { SEGMENTED_LIST_CLASS, segmentedLinkClass } from '../segmented-link-classes';
import { RANKING_PERIOD_LABELS } from './ranking-labels';

/** The weekly "most nominated" board, a tab of the ranking pages without being a period. */
export const NOMINATIONS_BOARD_PATH = canonicalPath({ kind: 'nominations' });

/**
 * Pill tabs of the four periods and the nominations board. Plain document links, so every ranking
 * page comes from the CDN-cached HTML.
 */
export function RankingTabs({ current }: { current: RankingPeriod | 'nominations' }) {
  const tabs = [
    ...RANKING_PERIODS.map((period) => ({
      key: period,
      href: canonicalPath({ kind: 'ranking', period }),
      label: RANKING_PERIOD_LABELS[period](),
    })),
    { key: 'nominations', href: NOMINATIONS_BOARD_PATH, label: m.ranking_tab_nominations() },
  ];
  return (
    <nav aria-label={m.ranking_tabs_label()} className="max-w-full overflow-x-auto">
      <ul className={SEGMENTED_LIST_CLASS}>
        {tabs.map((tab) => (
          <li key={tab.key}>
            <a
              href={tab.href}
              aria-current={tab.key === current ? 'page' : undefined}
              className={segmentedLinkClass(tab.key === current)}
            >
              {tab.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
