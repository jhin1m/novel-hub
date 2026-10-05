import type { CurrentUser, SearchCtx } from '@novel-hub/core';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { makeTestApiDeps } from '../testing';

const NAMES = { stories: 't_stories', authors: 't_authors' };

/** A Meilisearch client that records its queries and answers with no hits (or fails). */
function fakeSearch(fail?: Error) {
  const multiSearch = vi.fn((params: { queries: { indexUid: string }[] }) =>
    fail
      ? Promise.reject(fail)
      : Promise.resolve({
          results: params.queries.map((q) => ({
            indexUid: q.indexUid,
            hits: [],
            totalHits: 0,
            totalPages: 0,
          })),
        }),
  );
  const ctx = { client: { multiSearch }, names: NAMES } as unknown as SearchCtx;
  return { ctx, multiSearch };
}

function appWith(search: SearchCtx | null, user: CurrentUser | null = null) {
  return createApp(
    makeTestApiDeps({
      search,
      auth: {
        handler: () => Promise.resolve(new Response(null, { status: 404 })),
        lookupSession: () => Promise.resolve({ user, setCookies: [] }),
      },
    }),
  );
}

async function errorCode(res: Response): Promise<string | undefined> {
  const body = (await res.json()) as { error?: { code?: string } };
  return body.error?.code;
}

describe('GET /api/v1/search (no database)', () => {
  it('answers 503 SEARCH_UNAVAILABLE when search is not configured', async () => {
    const res = await appWith(null).request('/api/v1/search?q=kiem');
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await errorCode(res)).toBe('SEARCH_UNAVAILABLE');
  });

  it('answers 503 when Meilisearch fails or times out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx } = fakeSearch(new Error('request timed out'));
    const res = await appWith(ctx).request('/api/v1/search?q=kiem');
    expect([res.status, await errorCode(res)]).toEqual([503, 'SEARCH_UNAVAILABLE']);
  });

  it('never shows 18+ stories to a guest and never splices a bad tag into the filter', async () => {
    const { ctx, multiSearch } = fakeSearch();
    const tag = encodeURIComponent('x" OR isMature = true');
    const res = await appWith(ctx).request(`/api/v1/search?q=kiem&tag=${tag}&status=xyz&page=abc`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      stories: { hits: [], page: 1, totalPages: 1, totalHits: 0 },
      authors: [],
    });
    const [stories, authors] = multiSearch.mock.calls[0]?.[0].queries ?? [];
    expect(stories).toMatchObject({
      indexUid: NAMES.stories,
      q: 'kiem',
      filter: ['isMature = false'],
      page: 1,
      hitsPerPage: 20,
    });
    expect(authors).toMatchObject({ indexUid: NAMES.authors, q: 'kiem', limit: 5 });
  });

  it('browses an empty query by last update, without authors, in one request', async () => {
    const { ctx, multiSearch } = fakeSearch();
    await appWith(ctx).request('/api/v1/search?status=completed&minWords=50000&page=2');
    expect(multiSearch).toHaveBeenCalledTimes(1);
    const queries = multiSearch.mock.calls[0]?.[0].queries ?? [];
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      q: '',
      page: 2,
      sort: ['lastChapterAt:desc'],
      filter: ['isMature = false', 'status = "completed"', 'wordCount >= 50000'],
    });
  });
});
