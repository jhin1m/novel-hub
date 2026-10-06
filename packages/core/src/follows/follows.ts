import { type Db, follows, stories, users } from '@novel-hub/db';
import type { FollowTargetType } from '@novel-hub/shared';
import { and, eq, exists, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { publicStoryWhere } from '../catalog/story-card';
import { type Result, err, ok } from '../lib/result';

export type FollowError = 'NOT_FOUND' | 'FORBIDDEN';

/** What the follow buttons on a page need; only the asked keys are present. */
export interface FollowStatus {
  story?: boolean;
  author?: boolean;
}

/**
 * A story anyone can see (18+ included: whoever follows it has already opened its page). Same rule
 * as the reading page, so following never reveals a story the page would answer 404 for.
 */
async function findFollowableStory(
  db: Db,
  publicId: string,
): Promise<{ id: string; authorId: string } | null> {
  const [story] = await db
    .select({ id: stories.id, authorId: stories.authorId })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(eq(stories.publicId, publicId), publicStoryWhere({ includeMature: true })))
    .limit(1);
  return story ?? null;
}

/**
 * A user whose author page exists: not banned, with at least one public story that has a chapter
 * (the rule of `getAuthorPage`).
 */
async function findFollowableAuthor(db: Db, username: string): Promise<{ id: string } | null> {
  const [author] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.username, username),
        exists(
          db
            .select({ one: sql`1` })
            .from(stories)
            .where(
              and(
                eq(stories.authorId, users.id),
                eq(stories.visibility, 'published'),
                isNotNull(stories.lastChapterAt),
              ),
            ),
        ),
        ne(users.status, 'banned'),
      ),
    )
    .limit(1);
  return author ?? null;
}

async function insertFollow(
  db: Db,
  userId: string,
  targetType: FollowTargetType,
  targetId: string,
): Promise<void> {
  await db.insert(follows).values({ userId, targetType, targetId }).onConflictDoNothing();
}

/** Follows the story `publicId`. Following again is not an error; following one's own story is. */
export async function followStory(
  db: Db,
  user: { id: string },
  publicId: string,
): Promise<Result<void, FollowError>> {
  const story = await findFollowableStory(db, publicId);
  if (!story) return err('NOT_FOUND');
  if (story.authorId === user.id) return err('FORBIDDEN');
  await insertFollow(db, user.id, 'story', story.id);
  return ok(undefined);
}

/**
 * Stops following the story `publicId`, whatever state it is in now (a hidden story can still be
 * unfollowed). Not following it is not an error.
 */
export async function unfollowStory(db: Db, user: { id: string }, publicId: string): Promise<void> {
  await db
    .delete(follows)
    .where(
      and(
        eq(follows.userId, user.id),
        eq(follows.targetType, 'story'),
        inArray(
          follows.targetId,
          db.select({ id: stories.id }).from(stories).where(eq(stories.publicId, publicId)),
        ),
      ),
    );
}

/** Follows the author `username`. Following again is not an error; following oneself is. */
export async function followAuthor(
  db: Db,
  user: { id: string },
  username: string,
): Promise<Result<void, FollowError>> {
  const author = await findFollowableAuthor(db, username);
  if (!author) return err('NOT_FOUND');
  if (author.id === user.id) return err('FORBIDDEN');
  await insertFollow(db, user.id, 'user', author.id);
  return ok(undefined);
}

/** Stops following the author `username`. Not following them is not an error. */
export async function unfollowAuthor(
  db: Db,
  user: { id: string },
  username: string,
): Promise<void> {
  await db
    .delete(follows)
    .where(
      and(
        eq(follows.userId, user.id),
        eq(follows.targetType, 'user'),
        inArray(
          follows.targetId,
          db.select({ id: users.id }).from(users).where(eq(users.username, username)),
        ),
      ),
    );
}

/** Whether `userId` follows the story `storyPublicId` and/or the author `username`. */
export async function getFollowStatus(
  db: Db,
  userId: string,
  q: { storyPublicId?: string; username?: string },
): Promise<FollowStatus> {
  const status: FollowStatus = {};
  if (q.storyPublicId !== undefined) {
    const rows = await db
      .select({ one: sql`1` })
      .from(follows)
      .innerJoin(stories, eq(stories.id, follows.targetId))
      .where(
        and(
          eq(follows.userId, userId),
          eq(follows.targetType, 'story'),
          eq(stories.publicId, q.storyPublicId),
        ),
      )
      .limit(1);
    status.story = rows.length > 0;
  }
  if (q.username !== undefined) {
    const rows = await db
      .select({ one: sql`1` })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.targetId))
      .where(
        and(
          eq(follows.userId, userId),
          eq(follows.targetType, 'user'),
          eq(users.username, q.username),
        ),
      )
      .limit(1);
    status.author = rows.length > 0;
  }
  return status;
}
