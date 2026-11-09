import { type Db, chapters, stories, users } from '@novel-hub/db';
import { isValidPublicId } from '@novel-hub/shared';
import { and, eq } from 'drizzle-orm';
import { canReadChapter } from '../access/can-read-chapter';

/** Internal ids of a chapter anyone may read; never leaves the server. */
export interface ReadableChapterRef {
  storyId: string;
  chapterId: string;
  /** The story is 18+: comments under it are only for viewers who turned 18+ on. */
  isMature: boolean;
  /** The story's author, who may always comment under their own 18+ story. */
  authorId: string;
}

/**
 * The chapter at `/stories/…-{publicId}/chapter-{number}` when `canReadChapter` allows reading it,
 * otherwise `null`. Endpoints that record reading activity go through it, so nothing is recorded
 * against a chapter the reading page would answer 404 for.
 */
export async function findReadableChapterRef(
  db: Db,
  publicId: string,
  number: number,
): Promise<ReadableChapterRef | null> {
  if (!isValidPublicId(publicId)) return null;
  const [row] = await db
    .select({
      storyId: stories.id,
      chapterId: chapters.id,
      isMature: stories.isMature,
      authorId: stories.authorId,
      status: chapters.status,
      deletedAt: chapters.deletedAt,
      visibility: stories.visibility,
      authorStatus: users.status,
    })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .innerJoin(chapters, and(eq(chapters.storyId, stories.id), eq(chapters.number, number)))
    .where(eq(stories.publicId, publicId))
    .limit(1);
  if (!row) return null;
  const decision = canReadChapter(null, {
    status: row.status,
    deletedAt: row.deletedAt,
    story: { visibility: row.visibility, authorStatus: row.authorStatus },
  });
  return decision.readable
    ? {
        storyId: row.storyId,
        chapterId: row.chapterId,
        isMature: row.isMature,
        authorId: row.authorId,
      }
    : null;
}
