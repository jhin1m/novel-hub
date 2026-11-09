import { type Db, stories } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { type StoryActor, canEditStory } from '../policies/story';

/** An announcement as its author and readers get it; the id is only used by the delete call. */
export interface AnnouncementDto {
  id: string;
  body: string;
  createdAt: string;
}

export function toAnnouncementDto(row: {
  id: string;
  body: string;
  createdAt: Date;
}): AnnouncementDto {
  return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString() };
}

/**
 * The story behind `publicId` when `actor` may manage its announcements (whatever its visibility):
 * `NOT_FOUND` for an unknown story, `FORBIDDEN` for someone else's.
 */
export async function findOwnStory(
  db: Db,
  actor: StoryActor,
  publicId: string,
): Promise<{ ok: true; storyId: string } | { ok: false; error: 'NOT_FOUND' | 'FORBIDDEN' }> {
  const [story] = await db
    .select({ id: stories.id, authorId: stories.authorId })
    .from(stories)
    .where(eq(stories.publicId, publicId))
    .limit(1);
  if (!story) return { ok: false, error: 'NOT_FOUND' };
  if (!canEditStory(actor, story)) return { ok: false, error: 'FORBIDDEN' };
  return { ok: true, storyId: story.id };
}
