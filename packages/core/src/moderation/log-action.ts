import { type Tx, moderationActions } from '@novel-hub/db';
import type { ModerationLogAction } from '@novel-hub/shared';
import type { CurrentUser } from '../users/current-user';

export type ModerationError = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_STATE';

/** What an action acted on, as `moderation_actions.target_type` / `target_id` record it. */
export interface ModerationTarget {
  type:
    | 'story'
    | 'chapter'
    | 'user'
    | 'tag'
    | 'report'
    | 'comment'
    | 'rating'
    | 'contest'
    | 'announcement';
  id: string;
}

/**
 * Appends to the moderation log (an empty note is none), inside the transaction that acted. Returns
 * the new row's id for callers that key something on it (a warning's notification).
 */
export async function logModerationAction(
  tx: Tx,
  actor: CurrentUser,
  target: ModerationTarget,
  action: ModerationLogAction,
  note: string | undefined,
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(moderationActions)
    .values({
      modId: actor.id,
      targetType: target.type,
      targetId: target.id,
      action,
      note: note || null,
    })
    .returning({ id: moderationActions.id });
  if (!row) throw new Error('moderation log insert failed');
  return row;
}
