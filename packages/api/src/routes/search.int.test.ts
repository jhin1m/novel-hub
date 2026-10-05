import type { CurrentUser, SearchCtx } from '@novel-hub/core';
import { users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { makeTestApiDeps } from '../testing';

const { db, pool } = createTestDb();

/** Records the filters Meilisearch would receive; the stories themselves are covered in core. */
const multiSearch = vi.fn((params: { queries: { indexUid: string; filter?: string[] }[] }) =>
  Promise.resolve({
    results: params.queries.map((q) => ({
      indexUid: q.indexUid,
      hits: [],
      totalHits: 0,
      totalPages: 0,
    })),
  }),
);
const search = {
  client: { multiSearch },
  names: { stories: 't_stories', authors: 't_authors' },
} as unknown as SearchCtx;

let signedIn: CurrentUser | null = null;
const app = createApp(
  makeTestApiDeps({
    db,
    search,
    auth: {
      handler: () => Promise.resolve(new Response(null, { status: 404 })),
      lookupSession: () => Promise.resolve({ user: signedIn, setCookies: [] }),
    },
  }),
);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
  multiSearch.mockClear();
  signedIn = null;
});

async function signIn(username: string, showMature: boolean) {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: username,
      email: `${username}@example.com`,
      emailVerified: true,
      preferences: { showMature },
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  signedIn = {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    emailVerified: true,
    avatarUrl: null,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
  };
}

async function storyFilter(path: string): Promise<string[] | undefined> {
  const res = await app.request(path);
  expect(res.status).toBe(200);
  return multiSearch.mock.calls.at(-1)?.[0].queries[0]?.filter;
}

describe('GET /api/v1/search (real Postgres, fake Meilisearch)', () => {
  it('includes 18+ stories only for a reader who turned them on', async () => {
    expect(await storyFilter('/api/v1/search?q=a')).toEqual(['isMature = false']);
    await signIn('reader_off', false);
    expect(await storyFilter('/api/v1/search?q=a')).toEqual(['isMature = false']);
    await signIn('reader_on', true);
    expect(await storyFilter('/api/v1/search?q=a')).toEqual([]);
  });

  it('filters a merged tag as its canonical tag', async () => {
    expect(await storyFilter('/api/v1/search?tag=tu-tien')).toEqual([
      'isMature = false',
      'tagSlugs = "tien-hiep"',
    ]);
  });
});
