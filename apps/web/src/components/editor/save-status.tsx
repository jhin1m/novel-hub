import { m } from '@novel-hub/shared/messages';
// Relative imports: unit tests run without the `@/` alias.
import type { SaveStatus } from '../../lib/autosave';
import { cn } from '../../lib/utils';

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

/** Colour family of the status dot: saved, waiting to save, or something the author must see. */
export function saveStatusTone(status: SaveStatus): 'ok' | 'idle' | 'problem' {
  switch (status.kind) {
    case 'saved':
      return 'ok';
    case 'dirty':
    case 'saving':
      return 'idle';
    case 'error':
    case 'conflict':
      return 'problem';
  }
}

const DOT_CLASS = {
  ok: 'bg-primary',
  idle: 'bg-muted-foreground',
  problem: 'bg-destructive',
} as const;

/** Small save indicator; a live region so screen readers hear saves and errors. */
export function SaveStatusText({ status, className }: { status: SaveStatus; className?: string }) {
  const tone = saveStatusTone(status);
  return (
    <p
      role="status"
      aria-live="polite"
      data-status={status.kind}
      className={cn(
        'truncate text-xs',
        tone === 'problem' ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('mr-1.5 inline-block size-1.5 rounded-full align-middle', DOT_CLASS[tone])}
      />
      {saveStatusText(status)}
    </p>
  );
}
