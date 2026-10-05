import { type ChapterStatus, LIMITS } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { type FormEvent, useId, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const HOUR_MS = 3_600_000;
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
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'now' | 'later'>('now');
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
      <DialogContent>
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

          {isUpdate ? null : (
            <fieldset className="flex flex-col gap-3" disabled={pending}>
              <legend className="mb-2 text-sm font-medium">{m.publish_when_label()}</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={mode === 'now'}
                  onChange={() => setMode('now')}
                />
                {m.publish_now()}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={mode === 'later'}
                  onChange={() => setMode('later')}
                />
                {m.publish_later()}
              </label>
              {mode === 'later' ? (
                <div className="flex flex-col gap-1 pl-6">
                  <Label htmlFor={`${id}-when`}>{m.schedule_time_label()}</Label>
                  <Input
                    id={`${id}-when`}
                    type="datetime-local"
                    required
                    value={when}
                    min={earliest}
                    onChange={(e) => setWhen(e.target.value)}
                    aria-describedby={`${id}-when-hint`}
                  />
                  <p id={`${id}-when-hint`} className="text-sm text-muted-foreground">
                    {m.schedule_time_hint()}
                  </p>
                </div>
              ) : null}
            </fieldset>
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
