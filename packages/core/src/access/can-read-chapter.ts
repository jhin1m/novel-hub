import { chapters, stories, users } from '@novel-hub/db';
import type { ChapterStatus, StoryVisibility } from '@novel-hub/shared';
import { type SQL, and, eq, isNull, ne } from 'drizzle-orm';
import type { PolicyUser, UserStatus } from '../policies/user';

/** What the read decision looks at; callers load it in the same query as the content. */
export interface ReadableChapterFacts {
  status: ChapterStatus;
  deletedAt: Date | null;
  story: { visibility: StoryVisibility; authorStatus: UserStatus };
}

export type ReadDecision = { readable: true; publicCache: boolean } | { readable: false };

/**
 * A story anyone may see: published by its author, not hidden by a moderator, and its author not
 * banned. Banning only flips the user status; this check is what hides the content, so it must be
 * the same everywhere content is listed.
 */
export function isStoryPubliclyVisible(story: ReadableChapterFacts['story']): boolean {
  return story.visibility === 'published' && story.authorStatus !== 'banned';
}

/**
 * The single decision on whether a chapter can be read, and whether its page may be cached
 * publicly. Every place that serves chapter content (reading page, API, feeds, sitemap) calls this.
 * `user` is unused for now: a paywall would plug in here.
 */
export function canReadChapter(
  _user: PolicyUser | null,
  chapter: ReadableChapterFacts,
): ReadDecision {
  const readable =
    chapter.status === 'published' &&
    chapter.deletedAt === null &&
    isStoryPubliclyVisible(chapter.story);
  return readable ? { readable: true, publicCache: true } : { readable: false };
}

/**
 * SQL form of `canReadChapter` for list queries (previous/next, table of contents) over rows that
 * join `chapters`, `stories` and the author in `users`. Keep it in step with the function above.
 */
export function readableChapterWhere(): SQL {
  return and(
    eq(chapters.status, 'published'),
    isNull(chapters.deletedAt),
    eq(stories.visibility, 'published'),
    ne(users.status, 'banned'),
  ) as SQL;
}
