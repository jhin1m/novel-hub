import { type Db, chapters, reports, stories, users } from '@novel-hub/db';
import { NEW_ACCOUNT_DAYS, NEW_STORY_SPOTLIGHT, spotlightHourKey } from '@novel-hub/shared';
import { type SQL, and, eq, gte, isNull, lte, ne, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { homeListingWhere } from './home';
import { type StoryCardDto, publicStoryWhere, selectStoryCards, toStoryCard } from './story-card';

const DAY_MS = 24 * 60 * 60 * 1000;

const reporter = alias(users, 'reporter');

/**
 * An open report worth keeping a story out of the spotlight: an automatic one (no reporter, e.g. a
 * duplicate check) or one from a verified, not banned account past its first days. Reporting only
 * needs a signed-in account, so without this one throwaway account could empty the section.
 */
function trustedOpenReport(now: Date): SQL {
  const trustedSince = new Date(now.getTime() - NEW_ACCOUNT_DAYS * DAY_MS);
  return and(
    eq(reports.status, 'open'),
    or(
      isNull(reports.reporterId),
      and(
        eq(reporter.emailVerified, true),
        lte(reporter.createdAt, trustedSince),
        ne(reporter.status, 'banned'),
      ),
    ),
  ) as SQL;
}

/** No trusted open report on the story or on any of its chapters (both use `reports_target_idx`). */
function notUnderReview(db: Db, now: Date): SQL {
  const onStory = db
    .select({ one: sql`1` })
    .from(reports)
    .leftJoin(reporter, eq(reporter.id, reports.reporterId))
    .where(
      and(
        eq(reports.targetType, 'story'),
        eq(reports.targetId, stories.id),
        trustedOpenReport(now),
      ),
    );
  const onChapter = db
    .select({ one: sql`1` })
    .from(chapters)
    .innerJoin(reports, and(eq(reports.targetType, 'chapter'), eq(reports.targetId, chapters.id)))
    .leftJoin(reporter, eq(reporter.id, reports.reporterId))
    .where(and(eq(chapters.storyId, stories.id), trustedOpenReport(now)));
  return and(notExists(onStory), notExists(onChapter)) as SQL;
}

/**
 * "New stories that need readers": up to `limit` (`NEW_STORY_SPOTLIGHT.size` by default) public,
 * non-18+ stories created in the last `maxAgeDays` days, past the home listing threshold and not
 * under review. The order is a hash of the story id and the current hour, so it is the same all
 * hour (the home HTML is cached) and reshuffles the next one.
 */
export async function listNewStoriesSpotlight(
  db: Db,
  now: Date,
  limit: number = NEW_STORY_SPOTLIGHT.size,
): Promise<StoryCardDto[]> {
  const since = new Date(now.getTime() - NEW_STORY_SPOTLIGHT.maxAgeDays * DAY_MS);
  const hourKey = spotlightHourKey(now);
  const rows = await selectStoryCards(db)
    .where(
      and(
        publicStoryWhere({ includeMature: false }),
        gte(stories.createdAt, since),
        homeListingWhere(),
        notUnderReview(db, now),
      ),
    )
    .orderBy(sql`md5(${stories.id}::text || ${hourKey})`, stories.id)
    .limit(limit);
  return rows.map(toStoryCard);
}
