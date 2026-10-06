import { m } from '@novel-hub/shared/messages';
import { TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Another tab or device saved this draft since it was loaded; saving stops until a choice. */
export function ConflictBanner({
  pending,
  onLoadLatest,
  onKeepMine,
}: {
  pending: boolean;
  onLoadLatest: () => void;
  onKeepMine: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive bg-card px-4 py-3 text-sm"
    >
      <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-destructive" />
      <p className="grow">{m.editor_conflict_message()}</p>
      <Button type="button" size="sm" disabled={pending} onClick={onLoadLatest}>
        {m.editor_conflict_load_latest()}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onKeepMine}>
        {m.editor_conflict_keep_mine()}
      </Button>
    </div>
  );
}
