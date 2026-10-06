import { m } from '@novel-hub/shared/messages';
import { useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { ApiError, apiErrorMessage } from '@/lib/api-errors';
import type { Autosave, SaveStatus } from '@/lib/autosave';
import { type RevisionSummary, restoreRevisionRequest, revisionsQueryKey } from '@/lib/chapters';
import { browserStorage, clearMirror, mirrorKey } from '@/lib/draft-mirror';
import { type MirrorWriter, shortDateTime, wordsOf } from './chapter-editor-helpers';
import type { PublishError } from './use-chapter-publishing';

/** Restoring an older revision into the chapter draft. */
export function useRevisionRestore({
  editor,
  publicId,
  number,
  autosaveRef,
  mirrorRef,
  setStatus,
  setWords,
  setUnpublished,
  setNotice,
  setPublishError,
}: {
  editor: Editor | null;
  publicId: string;
  number: number;
  autosaveRef: RefObject<Autosave | null>;
  mirrorRef: RefObject<MirrorWriter | null>;
  setStatus: Dispatch<SetStateAction<SaveStatus>>;
  setWords: Dispatch<SetStateAction<number>>;
  setUnpublished: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setPublishError: Dispatch<SetStateAction<PublishError | null>>;
}): { restoreRevision: (revision: RevisionSummary) => Promise<string | null> } {
  const queryClient = useQueryClient();

  /**
   * Same locking as publishing: read-only editor and paused autosave, so every keystroke is saved
   * before the restore is sent with that version, and none lands on top of the restored content.
   */
  const restoreRevision = async (revision: RevisionSummary): Promise<string | null> => {
    const autosave = autosaveRef.current;
    if (!editor || !autosave) return m.editor_action_failed();
    setNotice(null);
    setPublishError(null);
    editor.setEditable(false, false);
    try {
      const saved = await autosave.pause();
      if (saved.kind !== 'saved') return m.revision_save_first();
      const draft = await restoreRevisionRequest(
        publicId,
        number,
        revision.key,
        autosave.getBase(),
      );
      editor.commands.setContent(draft.doc, { emitUpdate: false });
      autosave.rebase(draft.updatedAt, JSON.stringify(editor.getJSON()));
      // The local copy holds the replaced draft; the server now has everything the editor shows.
      mirrorRef.current?.cancel();
      clearMirror(browserStorage(), mirrorKey(publicId, number));
      setWords(wordsOf(draft.doc));
      setUnpublished(draft.hasUnpublishedChanges);
      setNotice(m.revision_restored({ time: shortDateTime(new Date(revision.createdAt)) }));
      // The replaced draft may have been kept as a new revision.
      void queryClient.invalidateQueries({
        queryKey: revisionsQueryKey(publicId, number),
        exact: true,
      });
      return null;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DRAFT_CONFLICT') {
        // Saved elsewhere meanwhile: the usual conflict banner lets the author pick a side.
        setStatus({ kind: 'conflict' });
        return null;
      }
      return apiErrorMessage(error);
    } finally {
      autosave.resume();
      editor.setEditable(true, false);
    }
  };

  return { restoreRevision };
}
