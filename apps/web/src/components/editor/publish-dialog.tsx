import { type ChapterStatus, LIMITS } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { type FormEvent, useState } from 'react';
import { FormMessage } from '@/components/auth-ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type PublishMode, PublishWhenFieldset } from './publish-when-fieldset';
import { wordMeter } from './word-meter';

const HOUR_MS = 3_600_000;

/** A centred 520px dialog from `md` up; below that the same node becomes a bottom sheet. */
const SHEET_ON_PHONE =
  'max-w-none sm:max-w-none md:max-w-[520px] max-md:top-auto max-md:bottom-0 max-md:left-0 ' +
  'max-md:max-h-[90dvh] max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-y-auto ' +
  'max-md:rounded-none max-md:rounded-t-[28px] max-md:border-x-0 max-md:border-b-0';
const MINUTE_MS = 60_000;

/**
 * Earliest value the picker offers: the server minimum plus a minute of slack for the time the
 * dialog stays open, rounded up because the field drops seconds.
 */
function earliestScheduleTime(now: number): Date {
  const at = now + LIMITS.schedule.minLeadMs + MINUTE_MS;
  return new Date(Math.ceil(at / MINUTE_MS) * MINUTE_MS);
}

/** `datetime-local` value (local wall-clock time, minute precision) for a date. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function wordCountInRange(words: number): boolean {
  return words >= LIMITS.chapterWords.min && words <= LIMITS.chapterWords.max;
}

const formatCount = (n: number) => n.toLocaleString('vi-VN');

/** Decorative bar under the word-count sentence, which already says everything in words. */
function WordMeter({ words, inRange }: { words: number; inRange: boolean }) {
  const { ratio, minMarker } = wordMeter(words);
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  return (
    <div aria-hidden className="relative h-1.5 w-full rounded-full bg-secondary">
      <div
        className={cn('h-full rounded-full', inRange ? 'bg-primary' : 'bg-destructive')}
        style={{ width: pct(ratio) }}
      />
      <div
        className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground/60"
        style={{ left: pct(minMarker) }}
      />
    </div>
  );
}

/**
 * Publish (or update) button with its confirmation dialog. A chapter that was never published can
 * also be scheduled. The work itself (pausing autosave, the request) belongs to the editor; the
 * callbacks resolve true on success, which closes the dialog.
 */
export function PublishDialog({
  number,
  status,
  words,
  pending,
  error,
  onPublish,
  onSchedule,
}: {
  number: number;
  status: ChapterStatus;
  words: number;
  pending: boolean;
  error: string | null;
  onPublish: () => Promise<boolean>;
  onSchedule: (at: Date) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PublishMode>('now');
  const [when, setWhen] = useState('');
  const [earliest, setEarliest] = useState('');
  const isUpdate = status === 'published';
  const inRange = wordCountInRange(words);

  const onOpenChange = (next: boolean) => {
    if (pending) return;
    if (next) {
      setMode('now');
      const now = Date.now();
      setWhen(toLocalInputValue(new Date(now + HOUR_MS)));
      setEarliest(toLocalInputValue(earliestScheduleTime(now)));
    }
    setOpen(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const done =
      mode === 'later' && !isUpdate ? await onSchedule(new Date(when)) : await onPublish();
    if (done) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={!inRange || status === 'hidden_by_mod' || pending}
        >
          {isUpdate ? m.publish_update_button() : m.publish_button()}
        </Button>
      </DialogTrigger>
      <DialogContent className={SHEET_ON_PHONE}>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isUpdate
                ? m.publish_update_title({ number: String(number) })
                : m.publish_dialog_title({ number: String(number) })}
            </DialogTitle>
            <DialogDescription>
              {m.publish_word_count({
                count: formatCount(words),
                min: formatCount(LIMITS.chapterWords.min),
                max: formatCount(LIMITS.chapterWords.max),
              })}
              {isUpdate ? ` ${m.publish_update_description()}` : null}
            </DialogDescription>
          </DialogHeader>
          <WordMeter words={words} inRange={inRange} />

          {isUpdate ? null : (
            <PublishWhenFieldset
              mode={mode}
              onModeChange={setMode}
              when={when}
              onWhenChange={setWhen}
              min={earliest}
              disabled={pending}
            />
          )}

          {error ? <FormMessage>{error}</FormMessage> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                {m.publish_cancel()}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !inRange}>
              {pending
                ? m.publish_pending()
                : isUpdate
                  ? m.publish_update_confirm()
                  : mode === 'later'
                    ? m.schedule_confirm()
                    : m.publish_confirm()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
