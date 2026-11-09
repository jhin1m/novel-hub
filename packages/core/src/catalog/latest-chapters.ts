import { type Db, chapters, stories, users } from '@novel-hub/db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { readableChapterWhere } from '../access/can-read-chapter';
import {
  type LatestChapterDto,
  type StoryCardDto,
  type StoryCardRow,
  toStoryCard,
} from './story-card';

/**
 * The readable chapter each story published last, by story id. Ordered by publication time, not
 * number: a lower-numbered draft published after a higher one is what moved the story up the
 * "recently updated" list. A blank title is reported as `null`.
 */
export async function latestReadableChapters(
  db: Db,
  storyIds: readonly string[],
): Promise<Map<string, LatestChapterDto>> {
  if (storyIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([chapters.storyId], {
      storyId: chapters.storyId,
      number: chapters.number,
      title: chapters.title,
    })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(inArray(chapters.storyId, [...storyIds]), readableChapterWhere()))
    // Drizzle's `desc()` sorts nulls first; a published chapter always has its time anyway.
    .orderBy(chapters.storyId, sql`${chapters.publishedAt} desc nulls last`, desc(chapters.number));
  return new Map(
    rows.map((row) => [row.storyId, { number: row.number, title: row.title?.trim() || null }]),
  );
}

/** `rows` as story cards, each with the readable chapter its story published last. */
export async function withLatestChapters(
  db: Db,
  rows: readonly StoryCardRow[],
): Promise<StoryCardDto[]> {
  const latest = await latestReadableChapters(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...toStoryCard(row), latestChapter: latest.get(row.id) ?? null }));
}
