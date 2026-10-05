import type { Db, Tx } from '@novel-hub/db';
import type { ModerationAction, ModerationActionInput } from '@novel-hub/shared';
import { type Result, err, ok } from '../lib/result';
import { canModerate } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import { setChapterHidden, setStoryHidden } from './content-visibility';
import type { ModerationError, ModerationTarget } from './log-action';
import { mergeTag } from './merge-tag';
import { closeReport, isOwnReport, resolveReportsFor } from './resolve-reports';
import { moderateUser } from './user-status';

function dispatch(
  tx: Tx,
  actor: CurrentUser,
  input: ModerationActionInput,
): Promise<Result<ModerationTarget, ModerationError>> {
  switch (input.action) {
    case 'hide_story':
    case 'restore_story':
      return setStoryHidden(
        tx,
        actor,
        input.storyPublicId,
        input.action === 'hide_story',
        input.note,
      );
    case 'hide_chapter':
    case 'restore_chapter':
      return setChapterHidden(
        tx,
        actor,
        input.storyPublicId,
        input.number,
        input.action === 'hide_chapter',
        input.note,
      );
    case 'mute_user':
    case 'unmute_user':
    case 'ban_user':
    case 'unban_user':
      return moderateUser(tx, actor, input.username, input.action, input.note);
    case 'merge_tag':
      return mergeTag(tx, actor, input.sourceSlug, input.targetSlug, input.note);
    case 'dismiss_report':
    case 'resolve_report':
      return closeReport(
        tx,
        actor,
        input.reportId,
        input.action === 'resolve_report' ? 'resolved' : 'dismissed',
        input.note,
      );
    default: {
      const unhandled: never = input;
      throw new Error(`Unhandled moderation action ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Applies one moderator action in one short transaction: locks, checks the source state, changes
 * it, logs it in `moderation_actions`, resolves the reports it answers (when taken from a report)
 * and writes the outbox events for content that changed publicly. Nothing reaches the network
 * inside; the worker purges the CDN and resyncs search from the outbox after the commit. Every
 * check runs before the first write, so an error leaves nothing behind.
 */
export async function applyModerationAction(
  db: Db,
  actor: CurrentUser,
  input: ModerationActionInput,
): Promise<Result<{ action: ModerationAction }, ModerationError>> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  return db.transaction(async (tx) => {
    const fromReport =
      input.action !== 'dismiss_report' && input.action !== 'resolve_report'
        ? input.reportId
        : undefined;
    // Acting "from" a report about oneself would close it as a side effect.
    if (fromReport && (await isOwnReport(tx, actor, fromReport))) return err('FORBIDDEN');
    const result = await dispatch(tx, actor, input);
    if (!result.ok) return result;
    if (fromReport) await resolveReportsFor(tx, actor, result.value, fromReport);
    return ok({ action: input.action });
  });
}
