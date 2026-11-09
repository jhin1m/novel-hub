import { type Db, stories, tags, users } from '@novel-hub/db';
import { RELATED_STORIES } from '@novel-hub/shared';
import { type SQL, and, eq, inArray, isNotNull, ne, notInArray, or, sql } from 'drizzle-orm';
import { isStoryPubliclyVisible } from '../access/can-read-chapter';
import { homeListingWhere } from '../catalog/home';
import {
  type StoryCardDto,
  publicStoryWhere,
  recentlyUpdatedOrder,
  selectStoryCards,
  toStoryCard,
} from '../catalog/story-card';

/** The "related stories" section at the bottom of a story page. Either list may be empty. */
export interface RelatedStoriesDto {
  sameAuthor: StoryCardDto[];
  /** Stories sharing the main tag (as its canonical tag), none already in `sameAuthor`. */
  sameMainTag: StoryCardDto[];
}

/**
 * Stories to suggest under the story `publicId`, or `null` when that story cannot be seen. Never
 * an 18+ story, even for readers who allowed them or under an 18+ story: the section is a nudge
 * to strangers, not a list they asked for. Only stories with a published chapter; the same-tag
 * list also needs the home listing threshold (a stranger's suggestion should have some substance;
 * the author's other stories need not).
 */
export async function listRelatedStories(
  db: Db,
  publicId: string,
): Promise<RelatedStoriesDto | null> {
  const [origin] = await db
    .select({
      id: stories.id,
      authorId: stories.authorId,
      visibility: stories.visibility,
      authorStatus: users.status,
      // A merged main tag counts as its canonical tag.
      mainTagKey: sql<string>`coalesce(${tags.canonicalId}, ${tags.id})`,
    })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .innerJoin(tags, eq(tags.id, stories.mainTagId))
    .where(eq(stories.publicId, publicId))
    .limit(1);
  if (
    !origin ||
    !isStoryPubliclyVisible({ visibility: origin.visibility, authorStatus: origin.authorStatus })
  )
    return null;

  const suggestable: SQL = and(
    publicStoryWhere({ includeMature: false }),
    isNotNull(stories.lastChapterAt),
    ne(stories.id, origin.id),
  ) as SQL;

  const sameAuthorRows = await selectStoryCards(db)
    .where(and(suggestable, eq(stories.authorId, origin.authorId)))
    .orderBy(...recentlyUpdatedOrder)
    .limit(RELATED_STORIES.sameAuthor);
  const taken = sameAuthorRows.map((r) => r.id);

  // Every tag that is, or was merged into, the origin's main tag.
  const sameTagIds = db
    .select({ id: tags.id })
    .from(tags)
    .where(or(eq(tags.id, origin.mainTagKey), eq(tags.canonicalId, origin.mainTagKey)));
  const sameMainTagRows = await selectStoryCards(db)
    .where(
      and(
        suggestable,
        homeListingWhere(),
        inArray(stories.mainTagId, sameTagIds),
        taken.length > 0 ? notInArray(stories.id, taken) : undefined,
      ),
    )
    .orderBy(...recentlyUpdatedOrder)
    .limit(RELATED_STORIES.sameMainTag);

  return {
    sameAuthor: sameAuthorRows.map(toStoryCard),
    sameMainTag: sameMainTagRows.map(toStoryCard),
  };
}
