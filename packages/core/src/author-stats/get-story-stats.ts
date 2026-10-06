import {
  type Db,
  chapterDailyStats,
  chapters,
  follows,
  readingProgress,
  storyDailyStats,
} from '@novel-hub/db';
import { STATS_TIMEZONE, type StoryStatsDto, authorStatsWindow } from '@novel-hub/shared';
import { and, asc, between, count, eq, ne, or, sql } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { loadOwnedStory } from '../stories/load-owned-story';
import { computeDropOff, reachedByChapter } from './drop-off';

/**
 * The author dashboard of one story over the last 30 stats days ending on `today`
 * (`statsDate(now)`). Only the story's author may see it; anyone else gets `NOT_FOUND`, so the
 * page never tells whether the story exists. Aggregates only, never who read or followed.
 */
export async function getStoryStats(
  db: Db,
  actor: StoryActor,
  publicId: string,
  today: string,
): Promise<Result<StoryStatsDto, 'NOT_FOUND'>> {
  const owned = await loadOwnedStory(db, actor, publicId);
  if (!owned.ok) return err('NOT_FOUND');
  const story = owned.value;
  const window = authorStatsWindow(today);

  // Reads per chapter in the window. Every chapter, so the total keeps reads of chapters since
  // deleted or hidden; only published ones are listed.
  const chapterRows = await db
    .select({
      number: chapters.number,
      title: chapters.title,
      listed: sql<boolean>`${chapters.status} = 'published' and ${chapters.deletedAt} is null`,
      views: sql<number>`coalesce(sum(${chapterDailyStats.views}), 0)`.mapWith(Number),
    })
    .from(chapters)
    .leftJoin(
      chapterDailyStats,
      and(
        eq(chapterDailyStats.chapterId, chapters.id),
        between(chapterDailyStats.date, window.from, window.to),
      ),
    )
    .where(eq(chapters.storyId, story.id))
    .groupBy(chapters.id)
    .orderBy(asc(chapters.number));

  const [readers] = await db
    .select({
      total: sql<number>`coalesce(sum(${storyDailyStats.uniqueReaders}), 0)`.mapWith(Number),
    })
    .from(storyDailyStats)
    .where(
      and(
        eq(storyDailyStats.storyId, story.id),
        between(storyDailyStats.date, window.from, window.to),
      ),
    );

  // Signed-in readers by the number of their latest chapter; the author's own reading left out.
  const latestRows = await db
    .select({ number: chapters.number, readers: count() })
    .from(readingProgress)
    .innerJoin(chapters, eq(chapters.id, readingProgress.chapterId))
    .where(and(eq(readingProgress.storyId, story.id), ne(readingProgress.userId, story.authorId)))
    .groupBy(chapters.number);

  const inWindow = sql`(${follows.createdAt} at time zone ${STATS_TIMEZONE})::date >= ${window.from}::date`;
  const isStory = and(eq(follows.targetType, 'story'), eq(follows.targetId, story.id));
  const isAuthor = and(eq(follows.targetType, 'user'), eq(follows.targetId, story.authorId));
  const [followCounts] = await db
    .select({
      storyTotal: sql<number>`count(*) filter (where ${isStory})`.mapWith(Number),
      storyNew: sql<number>`count(*) filter (where ${isStory} and ${inWindow})`.mapWith(Number),
      authorNew: sql<number>`count(*) filter (where ${isAuthor} and ${inWindow})`.mapWith(Number),
    })
    .from(follows)
    .where(or(isStory, isAuthor));

  const listed = chapterRows.filter((c) => c.listed);
  const reached = reachedByChapter(
    listed.map((c) => c.number),
    new Map(latestRows.map((r) => [r.number, r.readers])),
  );
  const rows = computeDropOff(
    listed.map((c, i) => ({
      number: c.number,
      title: c.title,
      views30d: c.views,
      reached: reached[i] ?? 0,
    })),
  );

  return ok({
    story: { publicId: story.publicId, title: story.title },
    window,
    totals: {
      views: chapterRows.reduce((sum, c) => sum + c.views, 0),
      readers: readers?.total ?? 0,
      newStoryFollows: followCounts?.storyNew ?? 0,
      newAuthorFollows: followCounts?.authorNew ?? 0,
      storyFollowersTotal: followCounts?.storyTotal ?? 0,
    },
    chapters: rows,
  });
}
