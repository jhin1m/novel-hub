import { type Db, chapters, comments, ratings, reports, stories, users } from '@novel-hub/db';
import type { ReportCreateInput, ReportTarget, ReportTargetType } from '@novel-hub/shared';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { canReadChapter } from '../access/can-read-chapter';
import { publicStoryWhere } from '../catalog/story-card';
import { type Result, err, ok } from '../lib/result';
import type { CurrentUser } from '../users/current-user';

export interface ResolvedTarget {
  type: ReportTargetType;
  id: string;
}

/**
 * The internal id of a target anyone can see: a public story (18+ included), a readable chapter, a
 * user who is not banned, a shown comment under a readable chapter, a shown rating of a public
 * story. Anything else is "not found", so a report never confirms that hidden content exists.
 */
async function resolveVisibleTarget(db: Db, target: ReportTarget): Promise<ResolvedTarget | null> {
  switch (target.type) {
    case 'story': {
      const [row] = await db
        .select({ id: stories.id })
        .from(stories)
        .innerJoin(users, eq(users.id, stories.authorId))
        .where(
          and(
            eq(stories.publicId, target.storyPublicId),
            publicStoryWhere({ includeMature: true }),
          ),
        );
      return row ? { type: 'story', id: row.id } : null;
    }
    case 'chapter': {
      const [row] = await db
        .select({
          id: chapters.id,
          status: chapters.status,
          deletedAt: chapters.deletedAt,
          visibility: stories.visibility,
          authorStatus: users.status,
        })
        .from(chapters)
        .innerJoin(stories, eq(stories.id, chapters.storyId))
        .innerJoin(users, eq(users.id, stories.authorId))
        .where(and(eq(stories.publicId, target.storyPublicId), eq(chapters.number, target.number)));
      if (!row) return null;
      const decision = canReadChapter(null, {
        status: row.status,
        deletedAt: row.deletedAt,
        story: { visibility: row.visibility, authorStatus: row.authorStatus },
      });
      return decision.readable ? { type: 'chapter', id: row.id } : null;
    }
    case 'comment': {
      // A reply is shown only while its thread is: a reply under a hidden thread is hidden too.
      const writer = alias(users, 'writer');
      const thread = alias(comments, 'thread');
      const threadWriter = alias(users, 'thread_writer');
      const [row] = await db
        .select({
          id: comments.id,
          commentStatus: comments.status,
          writerStatus: writer.status,
          status: chapters.status,
          deletedAt: chapters.deletedAt,
          visibility: stories.visibility,
          authorStatus: users.status,
        })
        .from(comments)
        .innerJoin(writer, eq(writer.id, comments.userId))
        .innerJoin(chapters, eq(chapters.id, comments.chapterId))
        .innerJoin(stories, eq(stories.id, chapters.storyId))
        .innerJoin(users, eq(users.id, stories.authorId))
        .leftJoin(thread, eq(thread.id, comments.parentId))
        .leftJoin(threadWriter, eq(threadWriter.id, thread.userId))
        .where(
          and(
            eq(comments.id, target.commentId),
            or(
              isNull(comments.parentId),
              and(eq(thread.status, 'visible'), ne(threadWriter.status, 'banned')),
            ),
          ),
        );
      if (!row || row.commentStatus !== 'visible' || row.writerStatus === 'banned') return null;
      const decision = canReadChapter(null, {
        status: row.status,
        deletedAt: row.deletedAt,
        story: { visibility: row.visibility, authorStatus: row.authorStatus },
      });
      return decision.readable ? { type: 'comment', id: row.id } : null;
    }
    case 'rating': {
      const writer = alias(users, 'writer');
      const [row] = await db
        .select({ id: ratings.id })
        .from(ratings)
        .innerJoin(writer, eq(writer.id, ratings.userId))
        .innerJoin(stories, eq(stories.id, ratings.storyId))
        .innerJoin(users, eq(users.id, stories.authorId))
        .where(
          and(
            eq(ratings.id, target.ratingId),
            eq(ratings.status, 'visible'),
            ne(writer.status, 'banned'),
            publicStoryWhere({ includeMature: true }),
          ),
        );
      return row ? { type: 'rating', id: row.id } : null;
    }
    case 'user': {
      const [row] = await db
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.username, target.username));
      return row && row.status !== 'banned' ? { type: 'user', id: row.id } : null;
    }
    default: {
      const unhandled: never = target;
      throw new Error(`Unhandled report target ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Files a reader's report. One open report per reader and target: a repeat while the first is still
 * open answers `created: false` instead of piling up. The check and the insert run under a
 * transaction-scoped advisory lock on (reporter, target), so two concurrent submits make one row.
 */
export async function createReport(
  db: Db,
  reporter: CurrentUser,
  input: ReportCreateInput,
): Promise<Result<{ created: boolean }, 'NOT_FOUND'>> {
  const target = await resolveVisibleTarget(db, input.target);
  if (!target) return err('NOT_FOUND');

  const created = await db.transaction(async (tx) => {
    const lockKey = `report:${reporter.id}:${target.type}:${target.id}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const [open] = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, reporter.id),
          eq(reports.targetType, target.type),
          eq(reports.targetId, target.id),
          eq(reports.status, 'open'),
        ),
      )
      .limit(1);
    if (open) return false;
    await tx.insert(reports).values({
      reporterId: reporter.id,
      targetType: target.type,
      targetId: target.id,
      reason: input.reason,
      detail: input.detail || null,
    });
    return true;
  });
  return ok({ created });
}
