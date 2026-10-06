import { type Tx, sessions, users } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { recordContentChanges } from '../content/outbox';
import { type Result, err, ok } from '../lib/result';
import { canModerateUser } from '../policies/moderation';
import type { UserStatus } from '../policies/user';
import type { CurrentUser } from '../users/current-user';
import { type ModerationError, type ModerationTarget, logModerationAction } from './log-action';

export type UserAction = 'mute_user' | 'unmute_user' | 'ban_user' | 'unban_user';

/** Status a user must be in for each action. */
const ALLOWED_FROM: Record<UserAction, readonly UserStatus[]> = {
  mute_user: ['active'],
  unmute_user: ['muted'],
  ban_user: ['active', 'muted'],
  unban_user: ['banned'],
};

/**
 * Bans a user: status `banned`, every session deleted, logged and put in the outbox, all in the
 * caller's transaction (the invariant of `policies/user.ts`). Stories are not touched: public
 * queries already leave out banned authors, the outbox purges the CDN and resyncs search.
 * Permission and state are checked by the caller: outside tests, only `applyModerationAction` calls
 * this.
 */
export async function banUser(
  tx: Tx,
  actor: CurrentUser,
  targetUserId: string,
  note?: string,
): Promise<void> {
  await tx.update(users).set({ status: 'banned' }).where(eq(users.id, targetUserId));
  await tx.delete(sessions).where(eq(sessions.userId, targetUserId));
  await logModerationAction(tx, actor, { type: 'user', id: targetUserId }, 'ban_user', note);
  await recordContentChanges(tx, [{ entity: 'user', action: 'banned', userId: targetUserId }]);
}

/**
 * Lifts a ban: status `active` (a mute from before the ban is not restored), logged and put in the
 * outbox so the content comes back. Checks are the caller's, as for `banUser`.
 */
export async function unbanUser(
  tx: Tx,
  actor: CurrentUser,
  targetUserId: string,
  note?: string,
): Promise<void> {
  await tx.update(users).set({ status: 'active' }).where(eq(users.id, targetUserId));
  await logModerationAction(tx, actor, { type: 'user', id: targetUserId }, 'unban_user', note);
  await recordContentChanges(tx, [{ entity: 'user', action: 'unbanned', userId: targetUserId }]);
}

/**
 * Mutes, unmutes, bans or unbans a user by username, with the user row locked. Muting only blocks
 * posting comments (`canPostCommunityContent`), so it changes nothing public and has no outbox event.
 */
export async function moderateUser(
  tx: Tx,
  actor: CurrentUser,
  username: string,
  action: UserAction,
  note: string | undefined,
): Promise<Result<ModerationTarget, ModerationError>> {
  const [target] = await tx
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.username, username))
    .for('update');
  if (!target) return err('NOT_FOUND');
  if (!canModerateUser(actor, target)) return err('FORBIDDEN');
  if (!ALLOWED_FROM[action].includes(target.status)) return err('INVALID_STATE');

  switch (action) {
    case 'ban_user':
      await banUser(tx, actor, target.id, note);
      break;
    case 'unban_user':
      await unbanUser(tx, actor, target.id, note);
      break;
    case 'mute_user':
    case 'unmute_user':
      await tx
        .update(users)
        .set({ status: action === 'mute_user' ? 'muted' : 'active' })
        .where(eq(users.id, target.id));
      await logModerationAction(tx, actor, { type: 'user', id: target.id }, action, note);
      break;
    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled user action ${String(unhandled)}`);
    }
  }
  return ok({ type: 'user', id: target.id });
}
