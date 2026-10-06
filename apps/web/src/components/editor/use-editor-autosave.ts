import type { EditorDocJson } from '@novel-hub/shared';
import type { Editor } from '@tiptap/react';
import { type Dispatch, type RefObject, type SetStateAction, useEffect } from 'react';
import { type Autosave, type SaveStatus, createAutosave } from '@/lib/autosave';
import { type DraftView, fetchDraft, saveDraftRequest } from '@/lib/chapters';
import {
  browserStorage,
  clearMirror,
  createMirrorWriter,
  mirrorKey,
  readMirror,
} from '@/lib/draft-mirror';
import { type MirrorWriter, WORD_COUNT_DELAY_MS, wordsOf } from './chapter-editor-helpers';

/**
 * Autosave and the local mirror for the chapter editor, plus conflict resolution. Refs and state
 * setters come from `ChapterEditor` so their identity never changes: passing a wrapper function
 * instead would re-run the effect on every render and rebuild autosave on a stale version.
 */
export function useEditorAutosave({
  editor,
  publicId,
  number,
  loadedRef,
  autosaveRef,
  mirrorRef,
  setStatus,
  setUnpublished,
  setWords,
  setResolving,
  setResolveError,
}: {
  editor: Editor | null;
  publicId: string;
  number: number;
  loadedRef: RefObject<DraftView>;
  autosaveRef: RefObject<Autosave | null>;
  mirrorRef: RefObject<MirrorWriter | null>;
  setStatus: Dispatch<SetStateAction<SaveStatus>>;
  setUnpublished: Dispatch<SetStateAction<boolean>>;
  setWords: Dispatch<SetStateAction<number>>;
  setResolving: Dispatch<SetStateAction<boolean>>;
  setResolveError: Dispatch<SetStateAction<boolean>>;
}): { resolveConflict: (keepMine: boolean) => Promise<void> } {
  // Wired once the document is loaded, so loading itself never counts as an edit.
  useEffect(() => {
    if (!editor) return;
    const storage = browserStorage();
    const key = mirrorKey(publicId, number);
    const mirror = createMirrorWriter({ storage, key });
    mirrorRef.current = mirror;

    const autosave = createAutosave({
      initialBase: loadedRef.current.updatedAt,
      initialJson: JSON.stringify(editor.getJSON()),
      save: (doc, base, opts) => saveDraftRequest(publicId, number, doc, base, opts),
      onStatus: setStatus,
      onSaved: (json) => {
        setUnpublished(true);
        // Drop the local copy only if it holds exactly what the server now has.
        mirror.flush();
        const current = readMirror(storage, key);
        if (current && JSON.stringify(current.doc) === json) clearMirror(storage, key);
      },
    });
    autosaveRef.current = autosave;

    let wordTimer: ReturnType<typeof setTimeout> | undefined;
    const getDoc = () => editor.getJSON() as EditorDocJson;
    const onUpdate = () => {
      autosave.change(getDoc);
      mirror.write(() => ({
        doc: getDoc(),
        baseUpdatedAt: autosave.getBase(),
        savedAt: new Date().toISOString(),
      }));
      clearTimeout(wordTimer);
      wordTimer = setTimeout(() => setWords(wordsOf(getDoc())), WORD_COUNT_DELAY_MS);
    };
    editor.on('update', onUpdate);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (autosave.hasPendingChanges()) event.preventDefault();
    };
    const onLeave = () => {
      mirror.flush();
      void autosave.flush({ keepalive: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onLeave();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      editor.off('update', onUpdate);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(wordTimer);
      // Leaving through an in-app link: save what is left before letting go.
      mirror.flush();
      void autosave.flush().finally(() => autosave.dispose());
      autosaveRef.current = null;
      mirrorRef.current = null;
    };
    // Refs and setters are stable, so only the editor, the chapter and its story re-run this.
  }, [
    editor,
    publicId,
    number,
    loadedRef,
    autosaveRef,
    mirrorRef,
    setStatus,
    setUnpublished,
    setWords,
  ]);

  const resolveConflict = async (keepMine: boolean) => {
    const autosave = autosaveRef.current;
    if (!editor || !autosave) return;
    setResolving(true);
    setResolveError(false);
    try {
      const latest = await fetchDraft(publicId, number);
      if (keepMine) {
        autosave.rebase(latest.updatedAt, JSON.stringify(latest.doc));
        // Queue what the editor shows: after a failed restore nothing is pending in autosave.
        autosave.change(() => editor.getJSON() as EditorDocJson);
        await autosave.flush();
      } else {
        editor.commands.setContent(latest.doc, { emitUpdate: false });
        autosave.rebase(latest.updatedAt, JSON.stringify(editor.getJSON()));
        await autosave.flush();
        mirrorRef.current?.cancel();
        clearMirror(browserStorage(), mirrorKey(publicId, number));
        setWords(wordsOf(latest.doc));
      }
    } catch {
      setResolveError(true);
    } finally {
      setResolving(false);
    }
  };

  return { resolveConflict };
}
