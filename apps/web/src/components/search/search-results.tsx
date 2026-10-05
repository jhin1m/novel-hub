import type { AuthorHit } from '@novel-hub/core';
import { type SearchQuery, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { createApiClient } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import { apiSearchQuery, searchHref } from '@/lib/search';
import { Pagination } from '../story/pagination';
import { StoryGrid } from '../story/story-grid';

const api = createApiClient();

/**
 * Results of a search, fetched in the browser from the uncached API (the session decides whether
 * 18+ stories show), so the server-rendered page stays the same for everyone.
 */
export function SearchResults({ query }: { query: SearchQuery }) {
  const result = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      const res = await api.api.v1.search.$get({ query: apiSearchQuery(query) });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
  });

  if (result.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {m.search_loading()}
      </p>
    );
  }
  if (result.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">{m.search_error()}</p>
        <Button variant="outline" onClick={() => void result.refetch()}>
          {m.search_retry()}
        </Button>
      </div>
    );
  }

  const { stories, authors } = result.data;
  return (
    <div className="flex flex-col gap-10">
      {authors.length > 0 ? <AuthorList authors={authors} /> : null}
      <section aria-labelledby="search-stories" className="flex flex-col gap-4">
        <h2 id="search-stories" className="font-serif text-xl font-semibold">
          {m.search_stories()}
        </h2>
        <p role="status" className="text-sm text-muted-foreground">
          {stories.totalHits > 0
            ? m.search_result_count({ count: String(stories.totalHits) })
            : m.search_empty()}
        </p>
        {stories.hits.length > 0 ? <StoryGrid stories={stories.hits} priorityCount={6} /> : null}
        <Pagination
          page={stories.page}
          totalPages={stories.totalPages}
          href={(page) => searchHref({ ...query, page })}
        />
      </section>
    </div>
  );
}

/** Matching authors, each a plain document link to their (CDN-cached) page. */
function AuthorList({ authors }: { authors: AuthorHit[] }) {
  return (
    <section aria-labelledby="search-authors" className="flex flex-col gap-3">
      <h2 id="search-authors" className="font-serif text-xl font-semibold">
        {m.search_authors()}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {authors.map((author) => (
          <li key={author.username}>
            <a
              href={canonicalPath({ kind: 'author', username: author.username })}
              className="flex flex-col rounded-md border px-3 py-2 hover:bg-accent"
            >
              <span className="font-medium">{author.displayName}</span>
              <span className="text-sm text-muted-foreground">
                {m.search_author_story_count({ count: String(author.storyCount) })}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
