import { type SearchQuery, searchQuerySchema } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { PageShell, PageTitle } from '../components/page-shell';
import { ExploreEntryRows } from '../components/search/explore-entry-rows';
import { SearchFilterChips } from '../components/search/search-filter-chips';
import { SearchForm } from '../components/search/search-form';
import { SearchResults } from '../components/search/search-results';
import { SiteLayout } from '../components/site-layout';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { isUnfiltered, searchHref } from '../lib/search';
import { getExplorePage } from '../server-fns/catalog';
import { seo } from '../lib/seo';

export const Route = createFileRoute('/search')({
  // Every field falls back instead of failing, so a hand-edited URL still shows the page.
  validateSearch: (raw: Record<string, unknown>): SearchQuery => searchQuerySchema.parse(raw),
  // Defaults stay out of the URL, so `/search` is not rewritten to `/search?q=&page=1`. The router
  // would write the AI filter as `noAi=true`; its URL form, shared with links and the API, is `1`.
  search: {
    middlewares: [
      stripSearchParams({ q: '', noAi: false, page: 1 }),
      ({ search, next }) => {
        const result = next(search);
        return result.noAi ? ({ ...result, noAi: 1 } as unknown as SearchQuery) : result;
      },
    ],
  },
  // The loader reads the genres, plus the entry rows while nothing is picked; results load in the
  // browser. It reruns only when the page switches between those two states (genres do not change
  // in a session), so a new query or filter never calls the server.
  loaderDeps: ({ search }) => ({ unfiltered: isUnfiltered(search) }),
  staleTime: Infinity,
  loader: async ({ location, deps }) => {
    const request = requestLocation(location);
    if (deps.unfiltered) {
      // The bare page holds the entry rows (story lists) and only `/search` itself is purged, so
      // any query that picks nothing (`?page=1`, `?fbclid=…`, an unknown order) is folded into it.
      assertCanonical(request, '/search');
    } else if (request.pathname !== '/search') {
      // Otherwise only the path is normalized: the query is the search itself, loaded in the
      // browser, and the HTML holds no story.
      assertCanonical(request, `/search${location.searchStr}`);
    }
    return getExplorePage({ data: { unfiltered: deps.unfiltered } });
  },
  // Weekly ranking unreadable (Redis down): its row is left out and the page cached a minute only.
  headers: ({ match, loaderData }) =>
    publicPageHeaders(match.status, {
      list: true,
      noindex: true,
      degraded: loaderData?.entry?.ranking.available === false,
    }),
  // Without text the page is "Explore", with text a search.
  head: ({ match }) =>
    match.search.q === ''
      ? seo({
          title: m.explore_page_title(),
          description: m.explore_page_description(),
          noindex: true,
        })
      : seo({
          title: m.search_page_title(),
          description: m.search_page_description(),
          noindex: true,
        }),
  component: SearchPage,
});

function SearchPage() {
  const query = Route.useSearch();
  const { genres, entry } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return (
    <SiteLayout>
      <PageShell className="gap-8">
        <div className="flex flex-col gap-4">
          <PageTitle>{query.q === '' ? m.explore_page_title() : m.search_page_title()}</PageTitle>
          <SearchForm
            // Back/forward changes the URL: start the form over from it.
            key={searchHref(query)}
            query={query}
            onSubmit={(next) => void navigate({ search: next })}
          />
          <SearchFilterChips query={query} genres={genres} />
        </div>
        {entry && isUnfiltered(query) ? <ExploreEntryRows entry={entry} /> : null}
        <SearchResults query={query} />
      </PageShell>
    </SiteLayout>
  );
}
