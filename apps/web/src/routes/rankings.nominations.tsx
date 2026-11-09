import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { PageShell, PageTitle } from '../components/page-shell';
import { RankingList } from '../components/rankings/ranking-list';
import { NOMINATIONS_BOARD_PATH, RankingTabs } from '../components/rankings/ranking-tabs';
import { SiteLayout } from '../components/site-layout';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { seo, siteConfig } from '../lib/seo';
import { getNominationBoard } from '../server-fns/rankings';

/**
 * Stories most nominated this week. The HTML never holds an 18+ story and, unlike the reading
 * rankings, readers who allowed 18+ content get no extra variant: the board is for discovery.
 */
export const Route = createFileRoute('/rankings/nominations')({
  loader: async ({ location }) => {
    assertCanonical(requestLocation(location), NOMINATIONS_BOARD_PATH);
    return getNominationBoard();
  },
  headers: ({ match }) => publicPageHeaders(match.status, { list: true }),
  head: ({ matches }) =>
    seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: NOMINATIONS_BOARD_PATH,
      title: m.nominations_page_title(),
      description: m.nominations_page_description(),
    }),
  component: NominationBoardPage,
});

function NominationBoardPage() {
  const { stories } = Route.useLoaderData();
  return (
    <SiteLayout>
      <PageShell className="gap-6">
        <header className="flex flex-col gap-2">
          <PageTitle>{m.nominations_page_title()}</PageTitle>
          <p className="text-muted-foreground">{m.nominations_page_intro()}</p>
        </header>
        <RankingTabs current="nominations" />
        {stories.length > 0 ? (
          <RankingList stories={stories} />
        ) : (
          <p className="rounded-[22px] border border-border bg-card p-6 text-muted-foreground">
            {m.nominations_empty()}
          </p>
        )}
      </PageShell>
    </SiteLayout>
  );
}
