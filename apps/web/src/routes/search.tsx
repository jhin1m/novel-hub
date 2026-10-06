import { type SearchQuery, searchQuerySchema } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { PageShell, PageTitle } from '../components/page-shell';
import { SearchForm } from '../components/search/search-form';
import { SearchResults } from '../components/search/search-results';
import { SiteLayout } from '../components/site-layout';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { searchHref } from '../lib/search';
import { getSearchFilters } from '../server-fns/catalog';
import { seo } from '../lib/seo';

export const Route = createFileRoute('/search')({
  // Every field falls back instead of failing, so a hand-edited URL still shows the page.
  validateSearch: (raw: Record<string, unknown>): SearchQuery => searchQuerySchema.parse(raw),
  // Defaults stay out of the URL, so `/search` is not rewritten to `/search?q=&page=1`.
  search: { middlewares: [stripSearchParams({ q: '', page: 1 })] },
  // The loader only reads the genres, so a new query never reruns it; results load in the browser.
  loader: async ({ location }) => {
    const request = requestLocation(location);
    // Only the path is normalized: the query is the search itself, not a cache variant to fold.
    if (request.pathname !== '/search') {
      assertCanonical(request, `/search${location.searchStr}`);
    }
    return getSearchFilters();
  },
  headers: ({ match }) => publicPageHeaders(match.status, { list: true, noindex: true }),
  head: () =>
    seo({ title: m.search_page_title(), description: m.search_page_description(), noindex: true }),
  component: SearchPage,
});

function SearchPage() {
  const query = Route.useSearch();
  const { genres } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return (
    <SiteLayout>
      <PageShell className="gap-8">
        <PageTitle>{m.search_page_title()}</PageTitle>
        <SearchForm
          // Back/forward changes the URL: start the form over from it.
          key={searchHref(query)}
          query={query}
          genres={genres}
          onSubmit={(next) => void navigate({ search: next })}
        />
        <SearchResults query={query} />
      </PageShell>
    </SiteLayout>
  );
}
