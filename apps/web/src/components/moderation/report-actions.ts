import type { ReportDto, StoryContext, UserContext } from '@novel-hub/core';
import type { ModerationAction, ModerationActionInput } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';

export const ACTION_LABELS: Record<ModerationAction, () => string> = {
  hide_story: m.moderation_action_hide_story,
  restore_story: m.moderation_action_restore_story,
  hide_chapter: m.moderation_action_hide_chapter,
  restore_chapter: m.moderation_action_restore_chapter,
  mute_user: m.moderation_action_mute_user,
  unmute_user: m.moderation_action_unmute_user,
  ban_user: m.moderation_action_ban_user,
  unban_user: m.moderation_action_unban_user,
  merge_tag: m.moderation_action_merge_tag,
  dismiss_report: m.moderation_action_dismiss_report,
  resolve_report: m.moderation_action_resolve_report,
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** One action a card offers, already bound to its target (note and report are added on click). */
export type CardAction =
  | DistributiveOmit<
      Exclude<ModerationActionInput, { action: 'merge_tag' | 'dismiss_report' | 'resolve_report' }>,
      'note' | 'reportId'
    >
  | { action: 'dismiss_report' }
  | { action: 'resolve_report' };

export function storyActions(story: StoryContext): CardAction[] {
  const actions: CardAction[] = [];
  if (story.visibility === 'published') {
    actions.push({ action: 'hide_story', storyPublicId: story.publicId });
  }
  if (story.visibility === 'hidden_by_mod') {
    actions.push({ action: 'restore_story', storyPublicId: story.publicId });
  }
  return actions;
}

export function userActions(
  username: string,
  status: StoryContext['author']['status'],
): CardAction[] {
  switch (status) {
    case 'active':
      return [
        { action: 'mute_user', username },
        { action: 'ban_user', username },
      ];
    case 'muted':
      return [
        { action: 'unmute_user', username },
        { action: 'ban_user', username },
      ];
    case 'banned':
      return [{ action: 'unban_user', username }];
  }
}

/** The viewer as the action list needs them. */
export interface Viewer {
  username: string;
  role: UserContext['role'];
}

/**
 * Mirror of `canModerateUser` in core, by username, to leave out buttons the server would refuse:
 * nobody acts on themselves or an admin, only an admin acts on a moderator (and their content).
 */
export function canActOn(
  viewer: Viewer,
  owner: { username: string; role: UserContext['role'] },
): boolean {
  if (viewer.username === owner.username || owner.role === 'admin') return false;
  return owner.role !== 'mod' || viewer.role === 'admin';
}

/** Every action the viewer may take on the report's target in its current state. */
export function actionsFor(report: ReportDto, viewer: Viewer): CardAction[] {
  const actions: CardAction[] = [];
  const { target } = report;
  const owner =
    target.type === 'user'
      ? target.user
      : target.type === 'story' || target.type === 'chapter'
        ? target.story.author
        : null;
  if (owner && canActOn(viewer, owner)) {
    if (target.type === 'chapter' && !target.chapter.deleted) {
      const ref = { storyPublicId: target.story.publicId, number: target.chapter.number };
      if (target.chapter.status === 'published') actions.push({ action: 'hide_chapter', ...ref });
      if (target.chapter.status === 'hidden_by_mod') {
        actions.push({ action: 'restore_chapter', ...ref });
      }
    }
    if (target.type === 'story' || target.type === 'chapter') {
      actions.push(...storyActions(target.story));
    }
    actions.push(...userActions(owner.username, owner.status));
  }
  // Reports about someone else's content can be closed even when its owner is out of reach.
  if (report.status === 'open' && owner?.username !== viewer.username) {
    actions.push({ action: 'resolve_report' }, { action: 'dismiss_report' });
  }
  return actions;
}
