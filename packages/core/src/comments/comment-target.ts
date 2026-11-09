import { type Db, chapters, comments, stories, users } from '@novel-hub/db';
import type { ChapterStatus, StoryVisibility } from '@novel-hub/shared';
import { type SQL, and, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { canReadChapter, isStoryPubliclyVisible } from '../access/can-read-chapter';
import type { UserStatus } from '../policies/user';

/**
 * Where a comment lives: under one chapter, or in the story's discussion (no chapter). Pins are
 * counted per scope, and a reply only joins a thread of the same scope.
 */
export type CommentScope = { chapterId: string } | { storyId: string };

/** Comments of `scope` (any level, any status). */
export function commentScopeWhere(scope: CommentScope): SQL {
  return 'chapterId' in scope
    ? eq(comments.chapterId, scope.chapterId)
    : (and(eq(comments.storyId, scope.storyId), isNull(comments.chapterId)) as SQL);
}

/** A comment with what every action on it by id decides from; internal, never sent out. */
export interface CommentTarget {
  id: string;
  userId: string;
  parentId: string | null;
  paragraphId: string | null;
  status: string;
  pinnedAt: Date | null;
  scope: CommentScope;
  storyAuthorId: string;
  isMature: boolean;
  /** Visible and its writer not banned: anyone may see it. */
  shown: boolean;
  /**
   * Its chapter may be read (`canReadChapter`), or for a discussion comment its story may be
   * (public, with a published chapter: the rule of `findRateableStory`).
   */
  readable: boolean;
}

interface ReadableFacts {
  chapterId: string | null;
  chapterStatus: string | null;
  chapterDeletedAt: Date | null;
  visibility: string;
  authorStatus: UserStatus;
  lastChapterAt: Date | null;
}

function isReadable(row: ReadableFacts): boolean {
  const story = {
    visibility: row.visibility as StoryVisibility,
    authorStatus: row.authorStatus,
  };
  if (row.chapterId === null) return isStoryPubliclyVisible(story) && row.lastChapterAt !== null;
  // Joined by id, so a chapter row exists whenever `chapterId` is set.
  return canReadChapter(null, {
    status: row.chapterStatus as ChapterStatus,
    deletedAt: row.chapterDeletedAt,
    story,
  }).readable;
}

/** The comment `commentId` names, whatever its state; `null` when there is none. */
export async function findCommentTarget(db: Db, commentId: string): Promise<CommentTarget | null> {
  const writer = alias(users, 'writer');
  const [row] = await db
    .select({
      id: comments.id,
      userId: comments.userId,
      parentId: comments.parentId,
      paragraphId: comments.paragraphId,
      status: comments.status,
      pinnedAt: comments.pinnedAt,
      chapterId: comments.chapterId,
      storyId: comments.storyId,
      writerStatus: writer.status,
      chapterStatus: chapters.status,
      chapterDeletedAt: chapters.deletedAt,
      visibility: stories.visibility,
      lastChapterAt: stories.lastChapterAt,
      isMature: stories.isMature,
      storyAuthorId: stories.authorId,
      authorStatus: users.status,
    })
    .from(comments)
    .innerJoin(writer, eq(writer.id, comments.userId))
    .innerJoin(stories, eq(stories.id, comments.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .leftJoin(chapters, eq(chapters.id, comments.chapterId))
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    parentId: row.parentId,
    paragraphId: row.paragraphId,
    status: row.status,
    pinnedAt: row.pinnedAt,
    scope: row.chapterId === null ? { storyId: row.storyId } : { chapterId: row.chapterId },
    storyAuthorId: row.storyAuthorId,
    isMature: row.isMature,
    shown: row.status === 'visible' && row.writerStatus !== 'banned',
    readable: isReadable(row),
  };
}
