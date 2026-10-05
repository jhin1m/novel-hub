import type { ChapterContext, ReportDto, StoryContext, UserContext } from '@novel-hub/core';
import {
  LIMITS,
  type ModerationAction,
  type ModerationActionInput,
  canonicalPath,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api-errors';
import { formatDate } from '@/lib/format';
import { useModerationAction } from '@/lib/moderation';
import { textLinkClass } from '../auth-ui';
import { REASON_LABELS } from '../report/reason-labels';
import { ConfirmDialog } from './confirm-dialog';

export const REPORT_STATUS_LABELS: Record<ReportDto['status'], () => string> = {
  open: m.report_status_open,
  resolved: m.report_status_resolved,
  dismissed: m.report_status_dismissed,
};

const ACTION_LABELS: Record<ModerationAction, () => string> = {
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
type CardAction =
  | DistributiveOmit<
      Exclude<ModerationActionInput, { action: 'merge_tag' | 'dismiss_report' | 'resolve_report' }>,
      'note' | 'reportId'
    >
  | { action: 'dismiss_report' }
  | { action: 'resolve_report' };

function storyActions(story: StoryContext): CardAction[] {
  const actions: CardAction[] = [];
  if (story.visibility === 'published') {
    actions.push({ action: 'hide_story', storyPublicId: story.publicId });
  }
  if (story.visibility === 'hidden_by_mod') {
    actions.push({ action: 'restore_story', storyPublicId: story.publicId });
  }
  return actions;
}

function userActions(username: string, status: StoryContext['author']['status']): CardAction[] {
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
interface Viewer {
  username: string;
  role: UserContext['role'];
}

/**
 * Mirror of `canModerateUser` in core, by username, to leave out buttons the server would refuse:
 * nobody acts on themselves or an admin, only an admin acts on a moderator (and their content).
 */
function canActOn(viewer: Viewer, owner: { username: string; role: UserContext['role'] }): boolean {
  if (viewer.username === owner.username || owner.role === 'admin') return false;
  return owner.role !== 'mod' || viewer.role === 'admin';
}

/** Every action the viewer may take on the report's target in its current state. */
function actionsFor(report: ReportDto, viewer: Viewer): CardAction[] {
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

function StoryLine({ story }: { story: StoryContext }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <a href={canonicalPath({ kind: 'story', ...story })} className={textLinkClass}>
        {story.title}
      </a>
      <span className="text-sm text-muted-foreground">
        {m.moderation_by_author({
          name: story.author.displayName,
          username: story.author.username,
        })}
      </span>
      {story.visibility === 'hidden_by_mod' ? (
        <Badge variant="secondary">{m.moderation_state_hidden()}</Badge>
      ) : null}
      {story.visibility === 'draft' ? (
        <Badge variant="secondary">{m.moderation_state_draft()}</Badge>
      ) : null}
      <UserStatusBadge status={story.author.status} />
    </p>
  );
}

function ChapterLine({ story, chapter }: { story: StoryContext; chapter: ChapterContext }) {
  const label = chapter.title
    ? `${m.moderation_chapter_label({ number: chapter.number })}: ${chapter.title}`
    : m.moderation_chapter_label({ number: chapter.number });
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <a
        href={canonicalPath({ kind: 'chapter', ...story, number: chapter.number })}
        className={textLinkClass}
      >
        {label}
      </a>
      {chapter.deleted ? <Badge variant="secondary">{m.moderation_state_deleted()}</Badge> : null}
      {chapter.status === 'hidden_by_mod' ? (
        <Badge variant="secondary">{m.moderation_state_hidden()}</Badge>
      ) : null}
      {chapter.status === 'draft' ? (
        <Badge variant="secondary">{m.moderation_state_draft()}</Badge>
      ) : null}
      {chapter.status === 'scheduled' ? (
        <Badge variant="secondary">{m.moderation_state_scheduled()}</Badge>
      ) : null}
    </p>
  );
}

function UserStatusBadge({ status }: { status: StoryContext['author']['status'] }) {
  if (status === 'muted') return <Badge variant="secondary">{m.moderation_user_muted()}</Badge>;
  if (status === 'banned') return <Badge variant="destructive">{m.moderation_user_banned()}</Badge>;
  return null;
}

function TargetContext({ report }: { report: ReportDto }) {
  const { target } = report;
  switch (target.type) {
    case 'story':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {m.moderation_target_story()}
          </p>
          <StoryLine story={target.story} />
        </div>
      );
    case 'chapter':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {m.moderation_target_chapter()}
          </p>
          <ChapterLine story={target.story} chapter={target.chapter} />
          <StoryLine story={target.story} />
        </div>
      );
    case 'user':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {m.moderation_target_user()}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <a
              href={canonicalPath({ kind: 'author', username: target.user.username })}
              className={textLinkClass}
            >
              {target.user.displayName} (@{target.user.username})
            </a>
            <UserStatusBadge status={target.user.status} />
          </p>
        </div>
      );
    case 'missing':
      return <p className="text-muted-foreground">{m.moderation_target_missing()}</p>;
  }
}

/**
 * A report in the queue: what was reported (with links to the live pages), why, by whom, and the
 * one-click actions for the target's current state. Banning asks for confirmation first.
 */
export function ReportCard({ report, viewer }: { report: ReportDto; viewer: Viewer }) {
  const id = useId();
  const [note, setNote] = useState('');
  const act = useModerationAction();

  const run = (action: CardAction) => {
    const common = { note: note.trim() || undefined };
    if (action.action === 'dismiss_report' || action.action === 'resolve_report') {
      act.mutate({ ...action, ...common, reportId: report.reportId });
      return;
    }
    // Taken from an open report: it and the target's other open reports become resolved.
    const reportId = report.status === 'open' ? report.reportId : undefined;
    act.mutate({ ...action, ...common, reportId });
  };

  const button = (action: CardAction) => {
    const ban = action.action === 'ban_user';
    const trigger = (
      <Button
        key={ban ? undefined : action.action}
        size="sm"
        variant={ban || action.action.startsWith('hide') ? 'destructive' : 'outline'}
        disabled={act.isPending}
        onClick={ban ? undefined : () => run(action)}
      >
        {ACTION_LABELS[action.action]()}
      </Button>
    );
    if (!ban) return trigger;
    return (
      <ConfirmDialog
        key={action.action}
        trigger={trigger}
        title={m.moderation_confirm_ban_title({ username: action.username })}
        description={m.moderation_confirm_ban_description()}
        onConfirm={() => run(action)}
      />
    );
  };

  return (
    <article aria-labelledby={`${id}-title`} className="flex flex-col gap-4 rounded-lg border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id={`${id}-title`} className="font-semibold">
          {REASON_LABELS[report.reason]()}
        </h2>
        <Badge variant={report.status === 'open' ? 'default' : 'secondary'}>
          {REPORT_STATUS_LABELS[report.status]()}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {m.moderation_reported_at({ date: formatDate(report.createdAt) })}
        </span>
      </header>

      <TargetContext report={report} />

      {report.duplicateOf ? (
        <div className="flex flex-col gap-1 rounded-md bg-muted p-3">
          <p className="text-sm">
            {m.moderation_duplicate_of({ percent: report.duplicateOf.similarityPct })}
          </p>
          <ChapterLine story={report.duplicateOf.story} chapter={report.duplicateOf.chapter} />
          <StoryLine story={report.duplicateOf.story} />
        </div>
      ) : null}

      {/* Plain text from the reader: React escapes it. */}
      {report.detail ? <p className="whitespace-pre-line">{report.detail}</p> : null}

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          {report.reporter
            ? m.moderation_reporter({ username: report.reporter.username })
            : m.moderation_reporter_system()}
        </span>
        {report.openOnTarget > 1 ? (
          <span>{m.moderation_open_on_target({ count: report.openOnTarget })}</span>
        ) : null}
        {report.handledBy ? (
          <span>{m.moderation_handled_by({ username: report.handledBy.username })}</span>
        ) : null}
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-note`}>{m.moderation_note_label()}</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={LIMITS.modNoteMax}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-10"
        />
      </div>
      <div className="flex flex-wrap gap-2">{actionsFor(report, viewer).map(button)}</div>
      {act.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(act.error)}
        </p>
      ) : null}
      {act.isSuccess ? (
        <p role="status" className="text-sm text-muted-foreground">
          {m.moderation_done()}
        </p>
      ) : null}
    </article>
  );
}
