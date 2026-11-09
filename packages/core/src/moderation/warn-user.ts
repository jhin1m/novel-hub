import { type Tx, notifications, reports, users } from '@novel-hub/db';
import { userWarnedPayload } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canModerateUser } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import { type ModerationError, type ModerationTarget, logModerationAction } from './log-action';

/**
 * Warns a user by username, with the user row locked: logs `warn_user` with the moderator's note
 * and notifies the user with that note as the reason. Nothing else changes: muting or banning stays
 * a separate decision. The rules for users apply (nobody warns themselves, an admin, or, unless an
 * admin, a moderator); a banned user cannot read it, so warning them is `INVALID_STATE`.
 *
 * Taken from a report, the report must still be open (its row locked): the action resolves it, so
 * a double click or a retry is refused instead of warning twice.
 */
export async function warnUser(
  tx: Tx,
  actor: CurrentUser,
  username: string,
  note: string,
  o: { reportId?: string | undefined } = {},
): Promise<Result<ModerationTarget, ModerationError>> {
  const [target] = await tx
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.username, username))
    .for('update');
  if (!target) return err('NOT_FOUND');
  if (!canModerateUser(actor, target)) return err('FORBIDDEN');
  if (target.status === 'banned') return err('INVALID_STATE');
  if (o.reportId) {
    const [report] = await tx
      .select({ status: reports.status })
      .from(reports)
      .where(eq(reports.id, o.reportId))
      .for('update');
    if (!report) return err('NOT_FOUND');
    if (report.status !== 'open') return err('INVALID_STATE');
  }

  const logged = await logModerationAction(
    tx,
    actor,
    { type: 'user', id: target.id },
    'warn_user',
    note,
  );
  await tx.insert(notifications).values({
    userId: target.id,
    type: 'user_warned',
    payload: userWarnedPayload.parse({ reason: note }),
    // One per warning: two warnings never merge into one unread notification.
    dedupeKey: `warning:${logged.id}`,
  });
  return ok({ type: 'user', id: target.id });
}
