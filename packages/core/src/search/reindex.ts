import { type Db, stories, users } from '@novel-hub/db';
import { type SQL, and, eq, gt, inArray, ne } from 'drizzle-orm';
import type { SearchCtx } from './client';
import { type AuthorDocRow, type StoryDocRow, loadAuthorDocs, loadStoryDocs } from './documents';
import { ensureSearchSettings } from './settings';
import { applyAuthorDocs, applyStoryDocs, deleteDocs } from './sync';

const BATCH = 1000;

export interface ReindexResult {
  upserted: number;
  deleted: number;
}

/** How to rebuild one index: rows come back ordered by id, with `doc: null` when not public. */
interface IndexSource<R extends { id: string; doc: unknown }> {
  name: string;
  uid: string;
  primaryKey: string;
  keyOf: (row: R) => string;
  /** Next batch of public rows after the cursor id. */
  loadPublic: (after: string | undefined) => Promise<R[]>;
  /** Current rows for doc keys, to re-check before deleting. */
  loadByKeys: (keys: string[]) => Promise<R[]>;
  apply: (rows: R[]) => Promise<void>;
}

async function rebuild<R extends { id: string; doc: unknown }>(
  ctx: SearchCtx,
  source: IndexSource<R>,
  log: (message: string) => void,
): Promise<ReindexResult> {
  const result: ReindexResult = { upserted: 0, deleted: 0 };
  const written = new Set<string>();
  for (let after: string | undefined; ;) {
    const rows = await source.loadPublic(after);
    await source.apply(rows);
    for (const row of rows) if (row.doc) written.add(source.keyOf(row));
    if (rows.length < BATCH) break;
    after = rows.at(-1)?.id;
  }
  result.upserted = written.size;

  const stale = (await listDocKeys(ctx, source.uid, source.primaryKey)).filter(
    (key) => !written.has(key),
  );
  for (let i = 0; i < stale.length; i += BATCH) {
    const keys = stale.slice(i, i + BATCH);
    // A row that became public meanwhile is rewritten, one no longer public is deleted by `apply`,
    // and keys with no row at all are deleted here.
    const rows = await source.loadByKeys(keys);
    await source.apply(rows);
    const found = new Set(rows.map(source.keyOf));
    await deleteDocs(
      ctx,
      source.uid,
      keys.filter((key) => !found.has(key)),
    );
    const live = rows.filter((row) => row.doc).length;
    result.upserted += live;
    result.deleted += keys.length - live;
  }
  log(`${source.name}: ${result.upserted} upserted, ${result.deleted} deleted`);
  return result;
}

/**
 * Rebuilds both indexes from Postgres (Meilisearch is never backed up): upserts every public story
 * and author in batches, then deletes docs whose row is no longer public. A doc missing from the
 * upserted set is re-checked against the database before it is deleted, so a story published
 * while the reindex runs stays.
 */
export async function reindexAll(
  db: Db,
  ctx: SearchCtx,
  log: (message: string) => void = () => {},
): Promise<ReindexResult> {
  await ensureSearchSettings(ctx);

  const publicStory = and(eq(stories.visibility, 'published'), ne(users.status, 'banned'));
  const storyResult = await rebuild<StoryDocRow>(
    ctx,
    {
      name: 'stories',
      uid: ctx.names.stories,
      primaryKey: 'publicId',
      keyOf: (row) => row.publicId,
      loadPublic: (after) =>
        loadStoryDocs(
          db,
          and(publicStory, after ? gt(stories.id, after) : undefined) as SQL,
          BATCH,
        ),
      loadByKeys: (keys) => loadStoryDocs(db, inArray(stories.publicId, keys), keys.length),
      apply: (rows) => applyStoryDocs(ctx, rows),
    },
    log,
  );

  // Uncorrelated on purpose: Drizzle leaves columns unqualified in a single-table subquery.
  const hasPublishedStory = inArray(
    users.id,
    db
      .selectDistinct({ id: stories.authorId })
      .from(stories)
      .where(eq(stories.visibility, 'published')),
  );
  const authorResult = await rebuild<AuthorDocRow>(
    ctx,
    {
      name: 'authors',
      uid: ctx.names.authors,
      primaryKey: 'username',
      keyOf: (row) => row.username,
      loadPublic: (after) =>
        loadAuthorDocs(
          db,
          and(
            ne(users.status, 'banned'),
            hasPublishedStory,
            after ? gt(users.id, after) : undefined,
          ) as SQL,
          BATCH,
        ),
      loadByKeys: (keys) => loadAuthorDocs(db, inArray(users.username, keys), keys.length),
      apply: (rows) => applyAuthorDocs(ctx, rows),
    },
    log,
  );

  return {
    upserted: storyResult.upserted + authorResult.upserted,
    deleted: storyResult.deleted + authorResult.deleted,
  };
}

/** Every primary key in an index. */
async function listDocKeys(ctx: SearchCtx, uid: string, key: string): Promise<string[]> {
  const keys: string[] = [];
  const index = ctx.client.index(uid);
  for (let offset = 0; ; offset += BATCH) {
    const page = await index.getDocuments({ fields: [key], limit: BATCH, offset });
    for (const doc of page.results) {
      const value: unknown = doc[key];
      if (typeof value === 'string') keys.push(value);
    }
    if (page.results.length < BATCH) return keys;
  }
}
