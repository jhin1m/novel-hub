import { type Db, stories, users } from '@novel-hub/db';
import { type SQL, and, eq, gt } from 'drizzle-orm';
import { type SearchCtx, waitForTask } from './client';
import {
  type AuthorDoc,
  type AuthorDocRow,
  type StoryDoc,
  type StoryDocRow,
  loadAuthorDocs,
  loadStoryDocs,
} from './documents';

/** What a sync did: wrote the doc, removed it (no longer public), or found no such row. */
export type SyncOutcome = 'upserted' | 'deleted' | 'missing';

const USER_STORIES_BATCH = 500;

/** Deletes docs by primary key, waiting for the task. Deleting a missing doc is not an error. */
export async function deleteDocs(
  ctx: SearchCtx,
  uid: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length > 0) {
    await waitForTask(ctx.client.index(uid).deleteDocuments([...ids]), `delete from ${uid}`);
  }
}

/** Writes the docs that should exist and deletes the rest, waiting for both tasks. */
export async function applyStoryDocs(ctx: SearchCtx, rows: readonly StoryDocRow[]): Promise<void> {
  const docs = rows.flatMap((row) => (row.doc ? [row.doc] : []));
  if (docs.length > 0) {
    await waitForTask(
      ctx.client.index<StoryDoc>(ctx.names.stories).addDocuments(docs),
      'upsert stories',
    );
  }
  await deleteDocs(
    ctx,
    ctx.names.stories,
    rows.filter((row) => !row.doc).map((row) => row.publicId),
  );
}

export async function applyAuthorDocs(
  ctx: SearchCtx,
  rows: readonly AuthorDocRow[],
): Promise<void> {
  const docs = rows.flatMap((row) => (row.doc ? [row.doc] : []));
  if (docs.length > 0) {
    await waitForTask(
      ctx.client.index<AuthorDoc>(ctx.names.authors).addDocuments(docs),
      'upsert authors',
    );
  }
  await deleteDocs(
    ctx,
    ctx.names.authors,
    rows.filter((row) => !row.doc).map((row) => row.username),
  );
}

const outcomeOf = (row: { doc: unknown } | undefined): SyncOutcome =>
  !row ? 'missing' : row.doc ? 'upserted' : 'deleted';

/** Extra passes before giving up on a row that keeps changing under the sync. */
const MAX_SETTLE_PASSES = 3;

/**
 * Applies rows, then reads them again and re-applies until what was written is still current.
 * Content jobs run concurrently: a job that read a story just before a moderator hid it may write
 * its stale doc after the hide job's delete; its own re-read then sees the hide and deletes again.
 */
export async function applySettled<R extends { doc: unknown }>(
  load: () => Promise<R[]>,
  apply: (rows: R[]) => Promise<void>,
): Promise<R[]> {
  let rows = await load();
  for (let pass = 0; ; pass += 1) {
    await apply(rows);
    const current = await load();
    if (JSON.stringify(current) === JSON.stringify(rows)) return current;
    if (pass === MAX_SETTLE_PASSES) {
      throw new Error('search sync: rows kept changing while syncing; retrying the job');
    }
    rows = current;
  }
}

/**
 * Brings one story's doc in line with Postgres, whatever happened to it. Idempotent and safe in
 * any order, since it only ever writes what the current row says.
 */
export async function syncStory(db: Db, ctx: SearchCtx, storyId: string): Promise<SyncOutcome> {
  const [row] = await applySettled(
    () => loadStoryDocs(db, eq(stories.id, storyId), 1),
    (rows) => applyStoryDocs(ctx, rows),
  );
  return outcomeOf(row);
}

/** Brings one author's doc in line with Postgres (story count, name, ban). */
export async function syncAuthor(db: Db, ctx: SearchCtx, userId: string): Promise<SyncOutcome> {
  const [row] = await applySettled(
    () => loadAuthorDocs(db, eq(users.id, userId), 1),
    (rows) => applyAuthorDocs(ctx, rows),
  );
  return outcomeOf(row);
}

/**
 * A story changed: its doc, and its author's doc (the story count may have moved). Returns the
 * story's outcome.
 */
export async function syncStoryAndAuthor(
  db: Db,
  ctx: SearchCtx,
  storyId: string,
): Promise<SyncOutcome> {
  const [row] = await applySettled(
    () => loadStoryDocs(db, eq(stories.id, storyId), 1),
    (rows) => applyStoryDocs(ctx, rows),
  );
  if (!row) return 'missing';
  await syncAuthor(db, ctx, row.authorId);
  return outcomeOf(row);
}

/**
 * A user changed (renamed, banned, unbanned): their author doc and every story of theirs, whatever
 * its visibility, since the author name and the ban show on each one.
 */
export async function syncUserContent(db: Db, ctx: SearchCtx, userId: string): Promise<void> {
  await syncAuthor(db, ctx, userId);
  let after: string | undefined;
  for (;;) {
    const cursor = after;
    const rows = await applySettled(
      () =>
        loadStoryDocs(
          db,
          and(eq(stories.authorId, userId), cursor ? gt(stories.id, cursor) : undefined) as SQL,
          USER_STORIES_BATCH,
        ),
      (batch) => applyStoryDocs(ctx, batch),
    );
    if (rows.length < USER_STORIES_BATCH) return;
    after = rows.at(-1)?.id;
  }
}
