import { m } from '@novel-hub/shared/messages';
import type { SaveStatus } from '@/lib/autosave';
import { cn } from '@/lib/utils';

const timeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function saveStatusText(status: SaveStatus): string {
  switch (status.kind) {
    case 'saved':
      return m.editor_status_saved({ time: timeFormat.format(status.at) });
    case 'dirty':
      return m.editor_status_dirty();
    case 'saving':
      return m.editor_status_saving();
    case 'error':
      return status.retryInMs === null
        ? m.editor_status_error()
        : m.editor_status_error_retry({ seconds: String(Math.round(status.retryInMs / 1000)) });
    case 'conflict':
      return m.editor_status_conflict();
  }
}

/** Small save indicator; a live region so screen readers hear saves and errors. */
export function SaveStatusText({ status, className }: { status: SaveStatus; className?: string }) {
  const problem = status.kind === 'error' || status.kind === 'conflict';
  return (
    <p
      role="status"
      aria-live="polite"
      data-status={status.kind}
      className={cn('text-xs', problem ? 'text-destructive' : 'text-muted-foreground', className)}
    >
      {saveStatusText(status)}
    </p>
  );
}
