import { type Db, stories, users } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { isStoryPubliclyVisible } from '../access/can-read-chapter';
import { listReadableChapters } from './get-chapter-for-reading';

/** Table of contents of a public story, or `null` when the story cannot be seen. */
export async function getChapterToc(
  db: Db,
  publicId: string,
): Promise<{ number: number; title: string | null }[] | null> {
  const [story] = await db
    .select({ id: stories.id, visibility: stories.visibility, authorStatus: users.status })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(eq(stories.publicId, publicId))
    .limit(1);
  if (!story || !isStoryPubliclyVisible(story)) return null;
  const chapters = await listReadableChapters(db, story.id);
  return chapters.map(({ number, title }) => ({ number, title }));
}
