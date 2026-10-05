import { type Db, type StoryRow, type Tx, stories } from '@novel-hub/db';
import { isValidPublicId } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { type StoryActor, canEditStory } from '../policies/story';

export type OwnedStoryError = 'NOT_FOUND' | 'FORBIDDEN';

/**
 * Loads a story the actor may edit. A malformed `publicId` is simply not found. `forUpdate` locks
 * the row until the surrounding transaction ends. `policy` swaps the edit check for a narrower one
 * (chapters use `canEditChapter`).
 */
export async function loadOwnedStory(
  db: Db | Tx,
  actor: StoryActor,
  publicId: string,
  opts: { forUpdate?: boolean; policy?: (actor: StoryActor, story: StoryRow) => boolean } = {},
): Promise<Result<StoryRow, OwnedStoryError>> {
  if (!isValidPublicId(publicId)) return err('NOT_FOUND');
  const query = db.select().from(stories).where(eq(stories.publicId, publicId));
  const [row] = opts.forUpdate ? await query.for('update') : await query;
  if (!row) return err('NOT_FOUND');
  if (!(opts.policy ?? canEditStory)(actor, row)) return err('FORBIDDEN');
  return ok(row);
}
