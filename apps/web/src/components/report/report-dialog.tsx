import {
  LIMITS,
  type ReportTarget,
  USER_REPORT_REASONS,
  type UserReportReason,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api-errors';
import { useCreateReport } from '@/lib/moderation';
import { REASON_LABELS } from './reason-labels';

const TITLES: Record<ReportTarget['type'], () => string> = {
  story: m.report_title_story,
  chapter: m.report_title_chapter,
  user: m.report_title_user,
};

/**
 * Contents of the report dialog: pick a reason, optionally describe, send. Once sent it only says
 * so; `ReportButton` remounts it on every opening, so a new report starts from a blank form.
 */
export function ReportDialogContent({ target }: { target: ReportTarget }) {
  const id = useId();
  const [reason, setReason] = useState<UserReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const report = useCreateReport();

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{TITLES[target.type]()}</DialogTitle>
        <DialogDescription>{m.report_description()}</DialogDescription>
      </DialogHeader>
      {report.isSuccess ? (
        <>
          <p role="status">{report.data ? m.report_sent() : m.report_already_sent()}</p>
          <DialogFooter>
            <DialogClose asChild>
              <Button>{m.report_close()}</Button>
            </DialogClose>
          </DialogFooter>
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason) report.mutate({ target, reason, detail: detail.trim() || undefined });
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-bold">{m.report_reason_label()}</legend>
            {USER_REPORT_REASONS.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  required
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  className="size-4 accent-primary"
                />
                {REASON_LABELS[value]()}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-detail`}>{m.report_detail_label()}</Label>
            <Textarea
              id={`${id}-detail`}
              value={detail}
              maxLength={LIMITS.reportDetailMax}
              onChange={(e) => setDetail(e.target.value)}
              aria-describedby={`${id}-count`}
              className="max-h-48"
            />
            <p id={`${id}-count`} className="text-right text-xs text-muted-foreground">
              {m.report_char_count({ count: detail.length, max: LIMITS.reportDetailMax })}
            </p>
          </div>
          {report.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {apiErrorMessage(report.error)}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {m.report_cancel()}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!reason || report.isPending}>
              {m.report_submit()}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}
