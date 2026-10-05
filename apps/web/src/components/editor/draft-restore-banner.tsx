import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';

const timeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Offered when this device holds edits the server never confirmed (tab closed mid-save). */
export function DraftRestoreBanner({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md border bg-muted px-4 py-3 text-sm"
    >
      <p className="grow">
        {m.editor_restore_message({ time: timeFormat.format(new Date(savedAt)) })}
      </p>
      <Button type="button" size="sm" onClick={onRestore}>
        {m.editor_restore_apply()}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onDiscard}>
        {m.editor_restore_discard()}
      </Button>
    </div>
  );
}
