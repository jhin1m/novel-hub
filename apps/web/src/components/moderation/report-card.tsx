import type { ReportDto, WarningSummary } from '@novel-hub/core';
import { LIMITS } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api-errors';
import { formatDate } from '@/lib/format';
import { useModerationAction } from '@/lib/moderation';
import { REASON_LABELS } from '../report/reason-labels';
import { ConfirmDialog } from './confirm-dialog';
import {
  ACTION_LABELS,
  type CardAction,
  type Viewer,
  actionsFor,
  needsNote,
  reportOwner,
} from './report-actions';
import { ChapterLine, StoryLine, TargetContext } from './report-target-context';

export const REPORT_STATUS_LABELS: Record<ReportDto['status'], () => string> = {
  open: m.report_status_open,
  resolved: m.report_status_resolved,
  dismissed: m.report_status_dismissed,
};

/**
 * A report in the queue: what was reported (with links to the live pages), why, by whom, the
 * recent warnings of the account it belongs to, and the one-click actions for the target's current
 * state. Banning and warning ask for confirmation first; a warning sends the note to the user, so
 * it waits for one.
 */
export function ReportCard({
  report,
  viewer,
  warnings,
}: {
  report: ReportDto;
  viewer: Viewer;
  /** Recent warnings by username, of the page's target accounts (none: absent). */
  warnings: Record<string, WarningSummary>;
}) {
  const id = useId();
  const [note, setNote] = useState('');
  const act = useModerationAction();
  const owner = reportOwner(report.target);
  const ownerWarnings = owner ? warnings[owner.username] : undefined;

  const run = (action: CardAction) => {
    const common = { note: note.trim() || undefined };
    if (action.action === 'dismiss_report' || action.action === 'resolve_report') {
      act.mutate({ ...action, ...common, reportId: report.reportId });
      return;
    }
    // Taken from an open report: it and the target's other open reports become resolved. Unpinning
    // answers no report (what was reported in the comment is still there), so it leaves them open.
    const reportId =
      report.status === 'open' && action.action !== 'unpin_comment' ? report.reportId : undefined;
    if (action.action === 'warn_user') {
      act.mutate({ ...action, note: note.trim(), reportId });
      return;
    }
    act.mutate({ ...action, ...common, reportId });
  };

  const confirmation = (action: CardAction) => {
    if (action.action === 'ban_user') {
      return {
        title: m.moderation_confirm_ban_title({ username: action.username }),
        description: m.moderation_confirm_ban_description(),
      };
    }
    // The user will read the note as the reason: it is what is being confirmed.
    if (action.action === 'warn_user') {
      return { title: m.moderation_warn_title({ username: action.username }), description: note };
    }
    return null;
  };

  const button = (action: CardAction) => {
    const confirm = confirmation(action);
    const trigger = (
      <Button
        key={confirm ? undefined : action.action}
        size="sm"
        variant={
          action.action === 'ban_user' || action.action.startsWith('hide')
            ? 'destructive'
            : 'outline'
        }
        disabled={act.isPending || (needsNote(action) && note.trim() === '')}
        onClick={confirm ? undefined : () => run(action)}
      >
        {ACTION_LABELS[action.action]()}
      </Button>
    );
    if (!confirm) return trigger;
    return (
      <ConfirmDialog
        key={action.action}
        trigger={trigger}
        title={confirm.title}
        description={confirm.description}
        onConfirm={() => run(action)}
      />
    );
  };
  const actions = actionsFor(report, viewer);

  return (
    <article
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 id={`${id}-title`} className="text-[17px] font-extrabold tracking-tight">
          {REASON_LABELS[report.reason]()}
        </h2>
        <Badge variant={report.status === 'open' ? 'warning' : 'muted'}>
          {REPORT_STATUS_LABELS[report.status]()}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {m.moderation_reported_at({ date: formatDate(report.createdAt) })}
        </span>
      </header>

      <TargetContext report={report} />

      {report.duplicateOf ? (
        <div className="flex flex-col gap-1 rounded-md bg-secondary p-3">
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
      {owner && ownerWarnings ? (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            <span>@{owner.username}</span>
            <span>{m.moderation_warnings_count({ count: ownerWarnings.count })}</span>
          </p>
          {ownerWarnings.suggest ? (
            <p className="rounded-md bg-secondary p-3 text-sm font-bold">
              {m.moderation_warnings_suggest()}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">{actions.map(button)}</div>
      {actions.some(needsNote) && note.trim() === '' ? (
        <p className="text-sm text-muted-foreground">{m.moderation_warn_note_hint()}</p>
      ) : null}
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
