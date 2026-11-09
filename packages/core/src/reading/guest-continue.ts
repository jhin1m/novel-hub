import { type Db, stories } from '@novel-hub/db';
import { and, eq } from 'drizzle-orm';
import {
  type StoryCardDto,
  publicStoryWhere,
  selectStoryCards,
  toStoryCard,
} from '../catalog/story-card';
import { findReadableChapterRef } from '../reader/readable-chapter-ref';

/** The card for a guest's saved position; `null` when the chapter cannot be read or the story is 18+. */
export async function getGuestContinueCard(
  db: Db,
  publicId: string,
  number: number,
): Promise<StoryCardDto | null> {
  const ref = await findReadableChapterRef(db, publicId, number);
  if (!ref || ref.isMature) return null;
  const [row] = await selectStoryCards(db)
    .where(and(eq(stories.publicId, publicId), publicStoryWhere({ includeMature: false })))
    .limit(1);
  return row ? toStoryCard(row) : null;
}
