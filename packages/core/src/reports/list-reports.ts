import { type Db, reports, users } from '@novel-hub/db';
import {
  REPORTS_PAGE_SIZE,
  type ReportListQuery,
  type ReportReason,
  type ReportStatus,
  duplicateReportDetail,
} from '@novel-hub/shared';
import { type SQL, and, count, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { totalPagesFor } from '../catalog/story-card';
import { type Result, err, ok } from '../lib/result';
import { canModerate } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import {
  type ChapterContext,
  type ChapterWithStory,
  type CommentContext,
  type CommentWithChapter,
  type StoryContext,
  type UserContext,
  loadChapterContexts,
  loadCommentContexts,
  loadStoryContexts,
  loadUserContexts,
} from './report-context';
import {
  type RatingContext,
  type RatingWithStory,
  loadRatingContexts,
} from './rating-report-context';

export type ReportTargetDto =
  | { type: 'story'; story: StoryContext }
  | { type: 'chapter'; story: StoryContext; chapter: ChapterContext }
  | { type: 'user'; user: UserContext }
  | { type: 'comment'; story: StoryContext; chapter: ChapterContext; comment: CommentContext }
  | { type: 'rating'; story: StoryContext; rating: RatingContext }
  /** The target no longer exists (or the row names an unknown type). */
  | { type: 'missing' };

/** A queue entry with its context translated to public keys; `reportId` is the only internal id. */
export interface ReportDto {
  reportId: string;
  reason: ReportReason;
  status: ReportStatus;
  /** The reader's description; `null` for automatic reports (their detail is internal data). */
  detail: string | null;
  createdAt: string;
  /** `null` = filed by the system (duplicate check) or by a deleted account. */
  reporter: { username: string } | null;
  handledBy: { username: string } | null;
  /** Open reports on the same target, this one included when open. */
  openOnTarget: number;
  target: ReportTargetDto;
  /** Duplicate reports: the chapter this one matches; `null` when the detail cannot be read. */
  duplicateOf: { story: StoryContext; chapter: ChapterContext; similarityPct: number } | null;
}

export interface ReportListPage {
  items: ReportDto[];
  page: number;
  totalPages: number;
}

const reporter = alias(users, 'reporter');
const handler = alias(users, 'handler');

/** The duplicate detail of a report, or `null` when it is missing or malformed (never throws). */
function parseDuplicateDetail(text: string | null) {
  if (text === null) return null;
  try {
    const parsed = duplicateReportDetail.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * One page of the moderation queue, newest first, filtered by status and optionally by reason.
 * Every target is translated to public keys (story public id and slug, chapter number, username),
 * hidden and deleted content included, so the moderator sees what they are acting on.
 */
export async function listReports(
  db: Db,
  actor: CurrentUser,
  query: ReportListQuery,
): Promise<Result<ReportListPage, 'FORBIDDEN'>> {
  if (!canModerate(actor)) return err('FORBIDDEN');

  const where = and(
    eq(reports.status, query.status),
    query.reason ? eq(reports.reason, query.reason) : undefined,
  ) as SQL;
  const [total] = await db.select({ n: count() }).from(reports).where(where);
  const totalPages = totalPagesFor(total?.n ?? 0, REPORTS_PAGE_SIZE);
  const rows = await db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      detail: reports.detail,
      status: reports.status,
      createdAt: reports.createdAt,
      reporterUsername: reporter.username,
      handlerUsername: handler.username,
    })
    .from(reports)
    .leftJoin(reporter, eq(reporter.id, reports.reporterId))
    .leftJoin(handler, eq(handler.id, reports.handledBy))
    .where(where)
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(REPORTS_PAGE_SIZE)
    .offset((query.page - 1) * REPORTS_PAGE_SIZE);
  if (rows.length === 0) return ok({ items: [], page: query.page, totalPages });

  const duplicates = new Map(
    rows
      .filter((row) => row.reason === 'duplicate')
      .map((row) => [row.id, parseDuplicateDetail(row.detail)] as const),
  );
  const idsOf = (type: string) =>
    rows.filter((row) => row.targetType === type).map((row) => row.targetId);
  const matchedIds = [...duplicates.values()].flatMap((d) => (d ? [d.matchedChapterId] : []));
  const [storyMap, chapterMap, userMap, commentMap, ratingMap, openCounts] = await Promise.all([
    loadStoryContexts(db, idsOf('story')),
    loadChapterContexts(db, [...idsOf('chapter'), ...matchedIds]),
    loadUserContexts(db, idsOf('user')),
    loadCommentContexts(db, idsOf('comment')),
    loadRatingContexts(db, idsOf('rating')),
    db
      .select({ targetType: reports.targetType, targetId: reports.targetId, n: count() })
      .from(reports)
      .where(
        and(
          eq(reports.status, 'open'),
          inArray(reports.targetId, [...new Set(rows.map((row) => row.targetId))]),
        ),
      )
      .groupBy(reports.targetType, reports.targetId),
  ]);
  const openKey = (type: string, id: string) => `${type}:${id}`;
  const openMap = new Map(openCounts.map((c) => [openKey(c.targetType, c.targetId), c.n]));

  const items = rows.map((row): ReportDto => {
    const duplicate = duplicates.get(row.id) ?? null;
    const matched = duplicate ? chapterMap.get(duplicate.matchedChapterId) : undefined;
    return {
      reportId: row.id,
      reason: row.reason as ReportReason,
      status: row.status as ReportStatus,
      detail: row.reason === 'duplicate' ? null : row.detail,
      createdAt: row.createdAt.toISOString(),
      reporter: row.reporterUsername ? { username: row.reporterUsername } : null,
      handledBy: row.handlerUsername ? { username: row.handlerUsername } : null,
      openOnTarget: openMap.get(openKey(row.targetType, row.targetId)) ?? 0,
      target: targetDto(row.targetType, row.targetId, {
        storyMap,
        chapterMap,
        userMap,
        commentMap,
        ratingMap,
      }),
      duplicateOf:
        duplicate && matched
          ? { ...matched, similarityPct: Math.round(duplicate.jaccard * 100) }
          : null,
    };
  });
  return ok({ items, page: query.page, totalPages });
}

function targetDto(
  type: string,
  id: string,
  maps: {
    storyMap: Map<string, StoryContext>;
    chapterMap: Map<string, ChapterWithStory>;
    userMap: Map<string, UserContext>;
    commentMap: Map<string, CommentWithChapter>;
    ratingMap: Map<string, RatingWithStory>;
  },
): ReportTargetDto {
  const { storyMap, chapterMap, userMap, commentMap, ratingMap } = maps;
  if (type === 'story') {
    const story = storyMap.get(id);
    return story ? { type, story } : { type: 'missing' };
  }
  if (type === 'chapter') {
    const found = chapterMap.get(id);
    return found ? { type, ...found } : { type: 'missing' };
  }
  if (type === 'user') {
    const user = userMap.get(id);
    return user ? { type, user } : { type: 'missing' };
  }
  if (type === 'comment') {
    const found = commentMap.get(id);
    return found ? { type, ...found } : { type: 'missing' };
  }
  if (type === 'rating') {
    const found = ratingMap.get(id);
    return found ? { type, ...found } : { type: 'missing' };
  }
  return { type: 'missing' };
}
