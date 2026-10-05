import { type Db, type Tx, stories } from '@novel-hub/db';
import { eq, sql } from 'drizzle-orm';

/**
 * Recomputes a story's counters from its chapters (published, not soft-deleted) instead of adding
 * deltas, so concurrent publishes, deletes and moderation can never drift them. Call it with the
 * story row already locked in the same transaction.
 */
export async function recomputeStoryCounters(tx: Db | Tx, storyId: string): Promise<void> {
  const published = sql`from chapters where story_id = ${storyId}
    and status = 'published' and deleted_at is null`;
  await tx
    .update(stories)
    .set({
      chapterCount: sql`(select count(*)::int ${published})`,
      wordCount: sql`(select coalesce(sum(word_count), 0)::int ${published})`,
      lastChapterAt: sql`(select max(published_at) ${published})`,
    })
    .where(eq(stories.id, storyId));
}
