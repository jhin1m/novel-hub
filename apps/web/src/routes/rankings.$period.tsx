import { RANKING_PERIODS, RANKING_RULES, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { NotFoundPage } from '../components/not-found';
import { PageShell, PageTitle } from '../components/page-shell';
import {
  RANKING_PERIOD_LABELS,
  RANKING_PERIOD_PHRASES,
} from '../components/rankings/ranking-labels';
import { RankingList } from '../components/rankings/ranking-list';
import { RankingTabs } from '../components/rankings/ranking-tabs';
import { SiteLayout } from '../components/site-layout';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { throwNotFound } from '../lib/route-signals';
import { seo, siteConfig } from '../lib/seo';
import { useMatureAwareList } from '../lib/use-mature-aware-list';
import { getRankingPage } from '../server-fns/rankings';

export const Route = createFileRoute('/rankings/$period')({
  loader: async ({ params, location }) => {
    const period = RANKING_PERIODS.find((p) => p === params.period.toLowerCase());
    if (!period) throwNotFound();
    assertCanonical(requestLocation(location), canonicalPath({ kind: 'ranking', period }));
    return { period, ...(await getRankingPage({ data: { period } })) };
  },
  // An outage renders the page empty: cached a minute only, so it fills again soon.
  headers: ({ match, loaderData }) =>
    publicPageHeaders(match.status, { list: true, degraded: loaderData?.available === false }),
  head: ({ loaderData, matches }) => {
    if (!loaderData) return {};
    const { period, available } = loaderData;
    return seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'ranking', period }),
      title: m.ranking_page_title({
        period: RANKING_PERIOD_LABELS[period]().toLocaleLowerCase('vi'),
      }),
      description: m.ranking_page_description({ period: RANKING_PERIOD_PHRASES[period]() }),
      // Listed in the sitemap whatever it holds; only an outage page stays out of the index.
      noindex: !available,
    });
  },
  notFoundComponent: NotFoundPage,
  component: RankingPage,
});

function RankingPage() {
  const { period, stories, available } = Route.useLoaderData();
  const list = useMatureAwareList({ stories, page: 1, totalPages: 1 }, { list: 'ranking', period });
  const empty = !available
    ? m.ranking_unavailable()
    : period === 'rising'
      ? m.ranking_empty_rising({ min: String(RANKING_RULES.minRisingReaders) })
      : m.ranking_empty();
  return (
    <SiteLayout>
      <PageShell className="gap-6">
        <header className="flex flex-col gap-2">
          <PageTitle>{m.ranking_page_heading()}</PageTitle>
          <p className="text-muted-foreground">
            {m.ranking_page_intro({ minutes: String(RANKING_RULES.refreshMinutes) })}
          </p>
        </header>
        <RankingTabs current={period} />
        {list.stories.length > 0 ? (
          <RankingList stories={list.stories} />
        ) : (
          <p className="rounded-[22px] border border-border bg-card p-6 text-muted-foreground">
            {empty}
          </p>
        )}
      </PageShell>
    </SiteLayout>
  );
}
