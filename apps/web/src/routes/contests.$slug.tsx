import { canonicalPageParam, canonicalPath, contestSlugSchema } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { textLinkClass } from '../components/auth-ui';
import { ContestHeader } from '../components/contests/contest-header';
import { ContestResults } from '../components/contests/contest-results';
import { NotFoundPage } from '../components/not-found';
import { PageShell } from '../components/page-shell';
import { SiteLayout } from '../components/site-layout';
import { Pagination } from '../components/story/pagination';
import { StoryGrid } from '../components/story/story-grid';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { throwNotFound } from '../lib/route-signals';
import { seo, siteConfig } from '../lib/seo';
import { cn } from '../lib/utils';
import { getContestPage } from '../server-fns/contests';

export const Route = createFileRoute('/contests/$slug')({
  // The page number is read from the raw request URL (`requestLocation`); this only makes the
  // router reload the data when it changes.
  loaderDeps: ({ search }) => ({ page: (search as { page?: unknown }).page }),
  loader: async ({ params, location }) => {
    const request = requestLocation(location);
    const slug = contestSlugSchema.safeParse(params.slug.toLowerCase());
    if (!slug.success) throwNotFound();
    const query = new URLSearchParams(request.href.split('?')[1] ?? '');
    const page = canonicalPageParam(query.getAll('page'));
    const result = await getContestPage({ data: { slug: slug.data, page } });
    if (!result) throwNotFound();
    assertCanonical(request, canonicalPath({ kind: 'contest', slug: result.contest.slug, page }));
    if (page > result.entries.totalPages) throwNotFound();
    return result;
  },
  headers: ({ match }) => publicPageHeaders(match.status, { list: true }),
  head: ({ loaderData, matches }) => {
    if (!loaderData) return {};
    const { contest, entries } = loaderData;
    return seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'contest', slug: contest.slug, page: entries.page }),
      title:
        entries.page > 1
          ? m.contest_page_title_paged({ title: contest.title, page: String(entries.page) })
          : m.contest_page_title({ title: contest.title }),
      description: m.contest_page_description({ title: contest.title }),
    });
  },
  notFoundComponent: NotFoundPage,
  component: ContestPage,
});

function ContestPage() {
  const { contest, winners, entries } = Route.useLoaderData();
  return (
    <SiteLayout>
      <PageShell className="gap-8">
        <a href={canonicalPath({ kind: 'contests' })} className={cn(textLinkClass, 'self-start')}>
          {m.contest_back()}
        </a>
        <ContestHeader contest={contest} />
        <ContestResults winners={winners} />
        <section aria-labelledby="contest-entries" className="flex flex-col gap-5">
          <h2 id="contest-entries" className="text-xl font-semibold">
            {m.contest_entries_title()}{' '}
            <span className="text-muted-foreground">({contest.entryCount})</span>
          </h2>
          {entries.items.length > 0 ? (
            <StoryGrid stories={entries.items} priorityCount={winners.length > 0 ? 0 : 6} />
          ) : (
            <p className="text-muted-foreground">{m.contest_entries_empty()}</p>
          )}
          <Pagination
            page={entries.page}
            totalPages={entries.totalPages}
            href={(page) => canonicalPath({ kind: 'contest', slug: contest.slug, page })}
          />
        </section>
      </PageShell>
    </SiteLayout>
  );
}
