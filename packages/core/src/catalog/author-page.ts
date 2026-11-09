import { type Db, stories, users } from '@novel-hub/db';
import { ANNOUNCEMENT_RULES } from '@novel-hub/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import {
  type AuthorAnnouncementDto,
  listAuthorAnnouncements,
} from '../announcements/list-announcements';
import { type UserBadgeDto, listUserBadges } from '../badges/user-badges';
import {
  type ListOptions,
  type StoryCardDto,
  publicStoryWhere,
  recentlyUpdatedOrder,
  selectStoryCards,
  toStoryCard,
} from './story-card';

export interface AuthorPageData {
  author: { username: string; displayName: string; bio: string | null };
  /** Public stories of the author, most recently updated first. */
  stories: StoryCardDto[];
  /** Milestone badges of the author, in catalog order. */
  badges: UserBadgeDto[];
  /** The author's latest announcements, newest first; never about an 18+ story (cached HTML). */
  announcements: AuthorAnnouncementDto[];
}

/**
 * An author's public page, or `null` when the user does not exist, is banned (their content is
 * hidden) or has no public story with a chapter. An author whose only public stories are 18+
 * still has a page; without `includeMature` it just lists none of them.
 */
export async function getAuthorPage(
  db: Db,
  username: string,
  o: ListOptions,
): Promise<AuthorPageData | null> {
  const [author] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      status: users.status,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!author || author.status === 'banned') return null;

  const rows = await selectStoryCards(db)
    .where(
      and(
        publicStoryWhere({ includeMature: true }),
        isNotNull(stories.lastChapterAt),
        eq(stories.authorId, author.id),
      ),
    )
    .orderBy(...recentlyUpdatedOrder);
  if (rows.length === 0) return null;
  const [badges, announcements] = await Promise.all([
    listUserBadges(db, author.id),
    listAuthorAnnouncements(db, author.id, { limit: ANNOUNCEMENT_RULES.authorPageLimit }),
  ]);
  return {
    author: { username: author.username, displayName: author.displayName, bio: author.bio },
    stories: rows.filter((r) => o.includeMature || !r.isMature).map(toStoryCard),
    badges,
    announcements,
  };
}
