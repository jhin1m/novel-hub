import { type Tx, chapters, comments, reports, stories } from '@novel-hub/db';
import { and, eq, or } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { CurrentUser } from '../users/current-user';
import { type ModerationError, type ModerationTarget, logModerationAction } from './log-action';

/**
 * The account a report target belongs to: the user itself, the author of the story/chapter, or
 * the writer of the comment.
 */
async function targetOwnerId(tx: Tx, type: string, id: string): Promise<string | null> {
  if (type === 'user') return id;
  if (type === 'story') {
    const [row] = await tx
      .select({ authorId: stories.authorId })
      .from(stories)
      .where(eq(stories.id, id));
    return row?.authorId ?? null;
  }
  if (type === 'chapter') {
    const [row] = await tx
      .select({ authorId: stories.authorId })
      .from(chapters)
      .innerJoin(stories, eq(stories.id, chapters.storyId))
      .where(eq(chapters.id, id));
    return row?.authorId ?? null;
  }
  if (type === 'comment') {
    const [row] = await tx
      .select({ userId: comments.userId })
      .from(comments)
      .where(eq(comments.id, id));
    return row?.userId ?? null;
  }
  return null;
}

/**
 * Closes one open report as `resolved` (acted on elsewhere) or `dismissed` (nothing wrong). Nobody
 * closes a report about themselves or their own content. Unlike the actions on content, a moderator
 * may close reports about other moderators' or admins' content, so those reports never get stuck.
 */
export async function closeReport(
  tx: Tx,
  actor: CurrentUser,
  reportId: string,
  status: 'resolved' | 'dismissed',
  note: string | undefined,
): Promise<Result<ModerationTarget, ModerationError>> {
  const [report] = await tx
    .select({
      id: reports.id,
      status: reports.status,
      targetType: reports.targetType,
      targetId: reports.targetId,
    })
    .from(reports)
    .where(eq(reports.id, reportId))
    .for('update');
  if (!report) return err('NOT_FOUND');
  if ((await targetOwnerId(tx, report.targetType, report.targetId)) === actor.id) {
    return err('FORBIDDEN');
  }
  if (report.status !== 'open') return err('INVALID_STATE');
  await tx.update(reports).set({ status, handledBy: actor.id }).where(eq(reports.id, reportId));
  const target: ModerationTarget = { type: 'report', id: reportId };
  await logModerationAction(
    tx,
    actor,
    target,
    status === 'resolved' ? 'resolve_report' : 'dismiss_report',
    note,
  );
  return ok(target);
}

/** Whether the report exists and is about the actor or their content (closing it is theirs not to do). */
export async function isOwnReport(tx: Tx, actor: CurrentUser, reportId: string): Promise<boolean> {
  const [report] = await tx
    .select({ targetType: reports.targetType, targetId: reports.targetId })
    .from(reports)
    .where(eq(reports.id, reportId));
  return !!report && (await targetOwnerId(tx, report.targetType, report.targetId)) === actor.id;
}

/**
 * After an action taken from a report: that report and every other open report on the acted-on
 * target become `resolved`, handled by the actor. The report may point elsewhere (a chapter report
 * acted on by hiding the whole story); it is resolved all the same.
 */
export async function resolveReportsFor(
  tx: Tx,
  actor: CurrentUser,
  target: ModerationTarget,
  reportId: string,
): Promise<void> {
  await tx
    .update(reports)
    .set({ status: 'resolved', handledBy: actor.id })
    .where(
      and(
        eq(reports.status, 'open'),
        or(
          eq(reports.id, reportId),
          and(eq(reports.targetType, target.type), eq(reports.targetId, target.id)),
        ),
      ),
    );
}
