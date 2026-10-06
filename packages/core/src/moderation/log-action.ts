import { type Tx, moderationActions } from '@novel-hub/db';
import type { ModerationLogAction } from '@novel-hub/shared';
import type { CurrentUser } from '../users/current-user';

export type ModerationError = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_STATE';

/** What an action acted on, as `moderation_actions.target_type` / `target_id` record it. */
export interface ModerationTarget {
  type: 'story' | 'chapter' | 'user' | 'tag' | 'report' | 'comment' | 'rating' | 'contest';
  id: string;
}

/** Appends to the moderation log (an empty note is none), inside the transaction that acted. */
export async function logModerationAction(
  tx: Tx,
  actor: CurrentUser,
  target: ModerationTarget,
  action: ModerationLogAction,
  note: string | undefined,
): Promise<void> {
  await tx.insert(moderationActions).values({
    modId: actor.id,
    targetType: target.type,
    targetId: target.id,
    action,
    note: note || null,
  });
}
