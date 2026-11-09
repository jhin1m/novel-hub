import { type Db, stories, storyNominations, users } from '@novel-hub/db';
import { NOMINATION_RULES, nominationWeekStart } from '@novel-hub/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  type StoryCardDto,
  publicStoryWhere,
  selectStoryCards,
  toStoryCard,
} from '../catalog/story-card';

export interface WeeklyNominationsDto {
  stories: StoryCardDto[];
  /** Monday (Vietnam time) of the week shown, `YYYY-MM-DD`. */
  weekStart: string;
}

/**
 * The "most nominated this week" board, for the publicly cached page: never an 18+ story, and only
 * nominations of accounts still `active` count, so votes of an account banned or muted afterwards
 * drop out. Ties go to the story that reached its count first.
 */
export async function listWeeklyNominations(
  db: Db,
  { now = new Date(), limit = NOMINATION_RULES.boardSize }: { now?: Date; limit?: number } = {},
): Promise<WeeklyNominationsDto> {
  const weekStart = nominationWeekStart(now);
  const tally = db
    .select({
      storyId: storyNominations.storyId,
      votes: sql<number>`count(*)::int`.as('votes'),
      lastAt: sql<Date>`max(${storyNominations.createdAt})`.as('last_at'),
    })
    .from(storyNominations)
    .innerJoin(users, eq(users.id, storyNominations.userId))
    .where(and(eq(storyNominations.weekStart, weekStart), eq(users.status, 'active')))
    .groupBy(storyNominations.storyId)
    .as('tally');
  const rows = await selectStoryCards(db)
    .innerJoin(tally, eq(tally.storyId, stories.id))
    .where(publicStoryWhere({ includeMature: false }))
    .orderBy(desc(tally.votes), asc(tally.lastAt), asc(stories.id))
    .limit(limit);
  return { stories: rows.map(toStoryCard), weekStart };
}
