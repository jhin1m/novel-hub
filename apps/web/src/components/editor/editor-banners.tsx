import { m } from '@novel-hub/shared/messages';
import { FormMessage } from '@/components/auth-ui';
import type { SaveStatus } from '@/lib/autosave';
import type { AuthorChapterView } from '@/lib/chapters';
import type { DraftMirror } from '@/lib/draft-mirror';
import { ConflictBanner } from './conflict-banner';
import { DraftRestoreBanner } from './draft-restore-banner';
import { ScheduleBanner } from './schedule-banner';

/** Conflict, schedule, notices, errors and local-copy restore shown above the chapter. */
export function EditorBanners({
  status,
  resolving,
  resolveError,
  onResolve,
  chapter,
  publishing,
  onUnschedule,
  onReschedule,
  notice,
  bannerError,
  restore,
  onApplyRestore,
  onDiscardRestore,
}: {
  status: SaveStatus;
  resolving: boolean;
  resolveError: boolean;
  onResolve: (keepMine: boolean) => void;
  chapter: AuthorChapterView;
  publishing: boolean;
  onUnschedule: () => void;
  onReschedule: () => void;
  notice: string | null;
  bannerError: string | null;
  restore: DraftMirror | null;
  onApplyRestore: () => void;
  onDiscardRestore: () => void;
}) {
  return (
    <>
      {status.kind === 'conflict' ? (
        <ConflictBanner
          pending={resolving}
          onLoadLatest={() => onResolve(false)}
          onKeepMine={() => onResolve(true)}
        />
      ) : null}
      {resolveError ? <FormMessage>{m.editor_action_failed()}</FormMessage> : null}
      {chapter.status === 'scheduled' && chapter.scheduledAt ? (
        <ScheduleBanner
          scheduledAt={chapter.scheduledAt}
          pending={publishing}
          onUnschedule={onUnschedule}
          onReschedule={onReschedule}
        />
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {bannerError !== null ? <FormMessage>{bannerError}</FormMessage> : null}
      {restore && status.kind !== 'conflict' ? (
        <DraftRestoreBanner
          savedAt={restore.savedAt}
          onRestore={onApplyRestore}
          onDiscard={onDiscardRestore}
        />
      ) : null}
    </>
  );
}
