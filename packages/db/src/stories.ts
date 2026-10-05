import { generatePublicId } from '@novel-hub/shared';
import type { Db } from './client';
import { stories } from './schema/stories';

/** A Drizzle transaction handle, for helpers that must run inside the caller's transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type NewStory = typeof stories.$inferInsert;
export type StoryRow = typeof stories.$inferSelect;

const PUBLIC_ID_ATTEMPTS = 5;

/**
 * Inserts a story with a fresh random `public_id`. A collision on `stories_public_id_key` is
 * skipped with `ON CONFLICT DO NOTHING` (so the transaction stays usable) and retried with a new
 * id, at most 5 times.
 */
export async function insertStoryWithPublicId(
  tx: Db | Tx,
  values: Omit<NewStory, 'publicId'>,
  gen: () => string = generatePublicId,
): Promise<{ id: string; publicId: string }> {
  for (let attempt = 0; attempt < PUBLIC_ID_ATTEMPTS; attempt++) {
    const [row] = await tx
      .insert(stories)
      .values({ ...values, publicId: gen() })
      .onConflictDoNothing({ target: stories.publicId })
      .returning({ id: stories.id, publicId: stories.publicId });
    if (row) return row;
  }
  throw new Error(`Could not generate a unique public_id after ${PUBLIC_ID_ATTEMPTS} attempts`);
}
