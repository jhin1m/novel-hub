import type { ReportDto } from '@novel-hub/core';
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
import { ACTION_LABELS, type CardAction, type Viewer, actionsFor } from './report-actions';
import { ChapterLine, StoryLine, TargetContext } from './report-target-context';

export const REPORT_STATUS_LABELS: Record<ReportDto['status'], () => string> = {
  open: m.report_status_open,
  resolved: m.report_status_resolved,
  dismissed: m.report_status_dismissed,
};

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
