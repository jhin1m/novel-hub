import { m } from '@novel-hub/shared/messages';
import { ClockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Shown while a chapter waits for its publish time. The scheduled content is a snapshot taken at
 * scheduling time; "update" re-snapshots the current draft for the same time.
 */
export function ScheduleBanner({
  scheduledAt,
  pending,
  onUnschedule,
  onReschedule,
}: {
  scheduledAt: string;
  pending: boolean;
  onUnschedule: () => void;
  onReschedule: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
      <ClockIcon aria-hidden className="size-4 shrink-0" />
      <p className="grow">
        {m.schedule_banner({ time: dateFormat.format(new Date(scheduledAt)) })}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-current"
        disabled={pending}
        onClick={onReschedule}
      >
        {m.schedule_update()}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-current"
        disabled={pending}
        onClick={onUnschedule}
      >
        {m.schedule_cancel()}
      </Button>
    </div>
  );
}
