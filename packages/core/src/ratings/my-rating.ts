import { type Db, ratings, stories } from '@novel-hub/db';
import { and, eq } from 'drizzle-orm';
import { type MyRatingDto, toMyRatingDto } from './rating-dto';

/** The reader's rating of the story `publicId`, hidden included (with its status), or `null`. */
export async function getMyRating(
  db: Db,
  userId: string,
  publicId: string,
): Promise<MyRatingDto | null> {
  const [row] = await db
    .select({
      score: ratings.score,
      review: ratings.review,
      status: ratings.status,
      createdAt: ratings.createdAt,
      updatedAt: ratings.updatedAt,
    })
    .from(ratings)
    .innerJoin(stories, eq(stories.id, ratings.storyId))
    .where(and(eq(ratings.userId, userId), eq(stories.publicId, publicId)));
  return row ? toMyRatingDto(row) : null;
}
