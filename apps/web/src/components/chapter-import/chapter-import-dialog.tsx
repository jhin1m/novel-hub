import { CHAPTER_IMPORT_LIMITS, type ChapterImportMode, LIMITS } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { FileUp } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  importIssue,
  scheduleInWindow,
  toImportRows,
} from '@/lib/chapter-import/chapter-import-rows';
import { parseChapterText } from '@/lib/chapter-import/parse-chapter-text';
import { useImportChapters } from '@/lib/chapter-import/use-import-chapters';
import { fromLocalInputValue, toLocalInputValue } from '@/lib/local-datetime';
import { FormMessage } from '../auth-ui';
import { ChapterImportModeFieldset } from './chapter-import-mode-fieldset';
import { ChapterImportOutcome } from './chapter-import-outcome';
import { ChapterImportPreview } from './chapter-import-preview';
import { ChapterImportSourceFields } from './chapter-import-source-fields';

const HOUR_MS = 3_600_000;

/**
 * Bulk import on the story's management page: paste text or pick a `.txt`, check the split in the
 * preview, then create the chapters as drafts, publish them now or schedule them at even intervals.
 * The checks mirror the server's, so the send button only lights up for an import it will accept;
 * account age and rate limits are answered by the server.
 */
export function ChapterImportDialog({
  publicId,
  nextNumber,
}: {
  publicId: string;
  nextNumber: number;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<ChapterImportMode>('draft');
  const [startAt, setStartAt] = useState('');
  const [minStartAt, setMinStartAt] = useState('');
  const [intervalHours, setIntervalHours] = useState('24');
  // Clock for the schedule window check: set on open, moved forward when a submit finds the times
  // went out of the window while the dialog stayed open.
  const [nowMs, setNowMs] = useState(0);
  const run = useImportChapters(publicId);

  const text = useDeferredValue(raw);
  const parsed = useMemo(() => parseChapterText(text), [text]);
  const rows = useMemo(() => toImportRows(parsed.chapters), [parsed]);
  const issue = importIssue(rows, mode);
  const publishing = mode !== 'draft';
  const startIso = fromLocalInputValue(startAt);
  const interval = Number(intervalHours);
  const scheduleFilled =
    startIso !== null &&
    Number.isInteger(interval) &&
    interval >= 1 &&
    interval <= CHAPTER_IMPORT_LIMITS.maxIntervalHours;
  const scheduleOutOfWindow =
    mode === 'schedule' &&
    scheduleFilled &&
    rows.length > 0 &&
    !scheduleInWindow(Date.parse(startIso), interval, rows.length, nowMs);
  const scheduleValid = mode !== 'schedule' || (scheduleFilled && !scheduleOutOfWindow);
  const sendable =
    rows.length > 0 &&
    !issue &&
    scheduleValid &&
    (!publishing || rows.every((row) => row.wordsInRange)) &&
    text === raw;

  const onOpenChange = (next: boolean) => {
    if (run.isPending) return;
    if (next) {
      const now = Date.now();
      setNowMs(now);
      setStartAt(toLocalInputValue(new Date(now + HOUR_MS)));
      setMinStartAt(toLocalInputValue(new Date(now + LIMITS.schedule.minLeadMs + 60_000)));
      run.reset();
    }
    setOpen(next);
  };

  const edit = (value: string) => {
    setRaw(value);
    if (!run.isPending) run.reset();
  };

  const submit = () => {
    if (!sendable || run.isPending) return;
    const now = Date.now();
    if (
      mode === 'schedule' &&
      !scheduleInWindow(Date.parse(startIso ?? ''), interval, rows.length, now)
    ) {
      setNowMs(now);
      return;
    }
    run.mutate(
      {
        mode,
        chapters: rows.map((row) =>
          row.title ? { title: row.title, text: row.text } : { text: row.text },
        ),
        ...(mode === 'schedule' && startIso
          ? { schedule: { startAt: startIso, intervalHours: interval } }
          : {}),
      },
      { onSuccess: () => setRaw('') },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <FileUp />
          {m.chapter_import_open()}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.chapter_import_open()}</DialogTitle>
          <DialogDescription>{m.chapter_import_intro()}</DialogDescription>
        </DialogHeader>
        <form
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <fieldset className="flex min-w-0 flex-col gap-4" disabled={run.isPending}>
            <ChapterImportSourceFields value={raw} onChange={edit} />
            {parsed.leadingTextDropped && rows.length > 0 ? (
              <p className="text-sm text-muted-foreground">{m.chapter_import_leading_text()}</p>
            ) : null}
            {text.trim() && rows.length === 0 ? (
              <FormMessage>{m.chapter_import_no_heading()}</FormMessage>
            ) : null}
            {rows.length > 0 ? (
              <>
                <ChapterImportPreview
                  rows={rows}
                  firstNumber={nextNumber}
                  checkWords={publishing}
                />
                <p className="text-xs text-muted-foreground">{m.chapter_import_numbering_hint()}</p>
              </>
            ) : null}
            {issue ? (
              <FormMessage>
                {issue.kind === 'too_many'
                  ? m.chapter_import_too_many({ max: issue.max })
                  : m.chapter_import_too_large()}
              </FormMessage>
            ) : null}
            <ChapterImportModeFieldset
              mode={mode}
              onModeChange={setMode}
              startAt={startAt}
              onStartAtChange={setStartAt}
              intervalHours={intervalHours}
              onIntervalHoursChange={setIntervalHours}
              minStartAt={minStartAt}
            />
            {scheduleOutOfWindow ? (
              <FormMessage>{m.error_invalid_schedule_time()}</FormMessage>
            ) : null}
          </fieldset>
          <ChapterImportOutcome error={run.error} result={run.data} />
          <DialogFooter>
            <Button type="submit" disabled={!sendable || run.isPending}>
              {m.chapter_import_submit({ count: rows.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
