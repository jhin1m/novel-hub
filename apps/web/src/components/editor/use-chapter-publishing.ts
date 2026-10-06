import { m } from '@novel-hub/shared/messages';
import { useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { ApiError, apiErrorMessage } from '@/lib/api-errors';
import type { Autosave } from '@/lib/autosave';
import {
  type AuthorChapterView,
  type PublishResponse,
  fetchDraft,
  publishRequest,
  scheduleRequest,
  unscheduleRequest,
} from '@/lib/chapters';
import { browserStorage, clearMirror, mirrorKey } from '@/lib/draft-mirror';
import { myStoriesQueryKey } from '@/lib/stories';
import type { MirrorWriter } from './chapter-editor-helpers';

export type PublishError = { message: string; from: 'dialog' | 'banner' };

/**
 * Publish, schedule and unschedule for the chapter editor. The actions are rebuilt on every
 * render, so they always read the current `chapter` and `editor`.
 */
export function useChapterPublishing({
  editor,
  publicId,
  number,
  chapter,
  autosaveRef,
  mirrorRef,
  setChapter,
  setUnpublished,
  setPublishing,
  setPublishError,
  setNotice,
}: {
  editor: Editor | null;
  publicId: string;
  number: number;
  chapter: AuthorChapterView;
  autosaveRef: RefObject<Autosave | null>;
  mirrorRef: RefObject<MirrorWriter | null>;
  setChapter: Dispatch<SetStateAction<AuthorChapterView>>;
  setUnpublished: Dispatch<SetStateAction<boolean>>;
  setPublishing: Dispatch<SetStateAction<boolean>>;
  setPublishError: Dispatch<SetStateAction<PublishError | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
}): {
  publishNow: () => Promise<boolean>;
  schedule: (at: Date, from?: 'dialog' | 'banner') => Promise<boolean>;
  unschedule: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  // Status, counters and story visibility shown in the writing area changed with the chapter.
  const refreshStories = () => void queryClient.invalidateQueries({ queryKey: myStoriesQueryKey });

  /**
   * Shared by publish, schedule and reschedule. The editor is read-only and autosave paused for
   * the whole request, so no keystroke can land between the last save and the server rendering
   * it, and none is lost when the server sends back a draft with rewritten paragraph ids.
   */
  /**
   * These codes mean the chapter changed state elsewhere (the sweeper published it, a moderator
   * hid it); reload its view so the banner and buttons match the server again.
   */
  const resyncAfter = (error: unknown) => {
    const stale = ['NOT_SCHEDULED', 'ALREADY_PUBLISHED', 'CHAPTER_HIDDEN_BY_MOD'];
    if (!(error instanceof ApiError) || !error.code || !stale.includes(error.code)) return;
    fetchDraft(publicId, number).then(
      (latest) => setChapter(latest.chapter),
      () => {},
    );
  };

  const runPublish = async (
    from: 'dialog' | 'banner',
    send: (base: string) => Promise<PublishResponse>,
    doneMessage: (result: PublishResponse) => string,
  ): Promise<boolean> => {
    const autosave = autosaveRef.current;
    if (!editor || !autosave) return false;
    setPublishing(true);
    setPublishError(null);
    setNotice(null);
    // `false`: toggling editability is not an edit and must not wake autosave.
    editor.setEditable(false, false);
    try {
      const saved = await autosave.pause();
      if (saved.kind !== 'saved') {
        setPublishError({ message: m.publish_save_first(), from });
        return false;
      }
      const result = await send(autosave.getBase());
      if (result.draft.doc) {
        editor.commands.setContent(result.draft.doc, { emitUpdate: false });
        // The local copy holds the old ids; the server now has everything it had.
        mirrorRef.current?.cancel();
        clearMirror(browserStorage(), mirrorKey(publicId, number));
      }
      autosave.rebase(result.draft.updatedAt, JSON.stringify(editor.getJSON()));
      setChapter(result.chapter);
      setUnpublished(false);
      setNotice(doneMessage(result));
      refreshStories();
      return true;
    } catch (error) {
      setPublishError({ message: apiErrorMessage(error), from });
      resyncAfter(error);
      return false;
    } finally {
      autosave.resume();
      editor.setEditable(true, false);
      setPublishing(false);
    }
  };

  const publishNow = () =>
    runPublish(
      'dialog',
      (base) => publishRequest(publicId, number, base),
      (result) =>
        result.unchanged
          ? m.publish_unchanged()
          : chapter.status === 'published'
            ? m.publish_updated()
            : m.publish_done(),
    );

  const schedule = (at: Date, from: 'dialog' | 'banner' = 'dialog') =>
    runPublish(
      from,
      (base) => scheduleRequest(publicId, number, base, at),
      () => m.schedule_done(),
    );

  const unschedule = async () => {
    setPublishing(true);
    setPublishError(null);
    setNotice(null);
    try {
      setChapter(await unscheduleRequest(publicId, number));
      setNotice(m.schedule_cancelled());
      refreshStories();
    } catch (error) {
      setPublishError({ message: apiErrorMessage(error), from: 'banner' });
      resyncAfter(error);
    } finally {
      setPublishing(false);
    }
  };

  return { publishNow, schedule, unschedule };
}
