import { createHash } from 'node:crypto';
import { type Db, type StoryRow, type Tx, stories } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { recordContentChanges } from '../content/outbox';
import { type CoverImageError, processCoverImage } from '../images/cover';
import { type Result, err, ok } from '../lib/result';
import { SemaphoreFullError, createSemaphore } from '../lib/semaphore';
import type { StoryActor } from '../policies/story';
import type { StoragePort } from '../storage/storage';
import { type OwnedStoryError, loadOwnedStory } from './load-owned-story';
import { type AuthorStoryView, toAuthorStoryView } from './story-view';

export interface CoverDeps {
  db: Db;
  storage: StoragePort;
}

/**
 * sharp is CPU- and memory-heavy: at most two covers are processed at once in this process, and
 * each waiting request holds its upload in memory, so the queue is capped too.
 */
const runImageJob = createSemaphore(2, 8);

/** Keys embed a content hash, so a URL never changes meaning and can be cached forever. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** Sets `cover_url` and, for a story that already has public pages, records the outbox event. */
async function writeCoverUrl(db: Db, storyId: string, coverUrl: string | null): Promise<StoryRow> {
  return db.transaction(async (tx: Tx) => {
    const [row] = await tx
      .update(stories)
      .set({ coverUrl })
      .where(eq(stories.id, storyId))
      .returning();
    if (!row) throw new Error('Story disappeared while changing its cover');
    if (row.visibility !== 'draft') {
      await recordContentChanges(tx, [{ entity: 'story', action: 'updated', storyId: row.id }]);
    }
    return row;
  });
}

/**
 * Replaces the story cover. Old files are kept on purpose: CDN-cached HTML and database restores
 * may still point at them, and orphans under `covers/{publicId}/` are cheap to clean up later.
 */
export async function setStoryCover(
  deps: CoverDeps,
  actor: StoryActor,
  publicId: string,
  file: Uint8Array,
): Promise<Result<AuthorStoryView, OwnedStoryError | CoverImageError | 'UPLOAD_BUSY'>> {
  const owned = await loadOwnedStory(deps.db, actor, publicId);
  if (!owned.ok) return err(owned.error);

  let processed: Awaited<ReturnType<typeof processCoverImage>>;
  try {
    processed = await runImageJob(() => processCoverImage(file));
  } catch (error) {
    if (error instanceof SemaphoreFullError) return err('UPLOAD_BUSY');
    throw error;
  }
  if (!processed.ok) return err(processed.error);
  const { w600, w300 } = processed.value;

  const hash = createHash('sha256').update(w600).digest('hex').slice(0, 16);
  const base = `covers/${owned.value.publicId}/${hash}`;
  await Promise.all([
    deps.storage.put(`${base}-600.webp`, w600, {
      contentType: 'image/webp',
      cacheControl: IMMUTABLE,
    }),
    deps.storage.put(`${base}-300.webp`, w300, {
      contentType: 'image/webp',
      cacheControl: IMMUTABLE,
    }),
  ]);

  const row = await writeCoverUrl(
    deps.db,
    owned.value.id,
    deps.storage.publicUrl(`${base}-600.webp`),
  );
  return ok(await toAuthorStoryView(deps.db, row));
}

/** Back to the generated text cover. The files stay in storage (see `setStoryCover`). */
export async function removeStoryCover(
  deps: Pick<CoverDeps, 'db'>,
  actor: StoryActor,
  publicId: string,
): Promise<Result<AuthorStoryView, OwnedStoryError>> {
  const owned = await loadOwnedStory(deps.db, actor, publicId);
  if (!owned.ok) return err(owned.error);
  const row = await writeCoverUrl(deps.db, owned.value.id, null);
  return ok(await toAuthorStoryView(deps.db, row));
}
