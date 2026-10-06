import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { ContestList } from '../components/contests/contest-list';
import { NotFoundPage } from '../components/not-found';
import { PageShell, PageTitle } from '../components/page-shell';
import { SiteLayout } from '../components/site-layout';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { seo, siteConfig } from '../lib/seo';
import { getContestsPage } from '../server-fns/contests';

export const Route = createFileRoute('/contests/')({
  loader: async ({ location }) => {
    assertCanonical(requestLocation(location), canonicalPath({ kind: 'contests' }));
    return getContestsPage();
  },
  headers: ({ match }) => publicPageHeaders(match.status, { list: true }),
  head: ({ matches }) =>
    seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'contests' }),
      title: m.contests_page_title(),
      description: m.contests_page_description(),
    }),
  notFoundComponent: NotFoundPage,
  component: ContestsPage,
});

function ContestsPage() {
  const list = Route.useLoaderData();
  return (
    <SiteLayout>
      <PageShell className="gap-6">
        <header className="flex flex-col gap-2">
          <PageTitle>{m.contests_page_heading()}</PageTitle>
          <p className="text-muted-foreground">{m.contests_page_intro()}</p>
        </header>
        <ContestList list={list} />
      </PageShell>
    </SiteLayout>
  );
}
