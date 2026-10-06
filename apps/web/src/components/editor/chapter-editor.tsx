import { editorExtensions } from '@novel-hub/shared/editor';
import { EditorContent, useEditor } from '@tiptap/react';
import { useRef, useState } from 'react';
import type { Autosave, SaveStatus } from '@/lib/autosave';
import type { AuthorChapterView, DraftView } from '@/lib/chapters';
import {
  type DraftMirror,
  browserStorage,
  clearMirror,
  mirrorKey,
  readMirror,
  sameDoc,
} from '@/lib/draft-mirror';
import { useMediaQuery } from '@/lib/use-media-query';
import {
  DESKTOP_QUERY,
  type MirrorWriter,
  chapterEditorProps,
  wordsOf,
} from './chapter-editor-helpers';
import { ChapterMetaField } from './chapter-meta-field';
import { EditorBanners } from './editor-banners';
import { EditorHeader, MobileChapterMeta } from './editor-header';
import { useFocusMode } from './focus-toggle';
import { type PublishError, useChapterPublishing } from './use-chapter-publishing';
import { useEditorAutosave } from './use-editor-autosave';
import { useRevisionRestore } from './use-revision-restore';

/**
 * The chapter writing screen. Loaded once per visit from `draft`; from then on the editor is the
 * source of truth and autosave pushes it to the server, guarded by the draft version.
 */
export function ChapterEditor({
  publicId,
  number,
  draft,
}: {
  publicId: string;
  number: number;
  draft: DraftView;
}) {
  const [status, setStatus] = useState<SaveStatus>(() => ({
    kind: 'saved',
    at: new Date(draft.updatedAt),
  }));
  const [words, setWords] = useState(() => wordsOf(draft.doc));
  const [focus, setFocus] = useFocusMode();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // The route renders only in the browser, so local storage is readable on the first render.
  const [restore, setRestore] = useState<DraftMirror | null>(() => {
    const saved = readMirror(browserStorage(), mirrorKey(publicId, number));
    return saved && !sameDoc(saved.doc, draft.doc) ? saved : null;
  });
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(false);
  const [chapter, setChapter] = useState<AuthorChapterView>(draft.chapter);
  const [unpublished, setUnpublished] = useState(draft.hasUnpublishedChanges);
  const [publishing, setPublishing] = useState(false);
  // Errors show where the action started: in the dialog or above the editor (banner actions).
  const [publishError, setPublishError] = useState<PublishError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The draft as loaded; later refetches must not rebuild autosave on a version it never saw.
  const loadedRef = useRef(draft);
  const autosaveRef = useRef<Autosave | null>(null);
  const mirrorRef = useRef<MirrorWriter | null>(null);

  const editor = useEditor({
    extensions: editorExtensions,
    content: draft.doc,
    immediatelyRender: false,
    editorProps: chapterEditorProps(),
  });

  const { resolveConflict } = useEditorAutosave({
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
  });

  const { publishNow, schedule, unschedule } = useChapterPublishing({
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
  });

  const { restoreRevision } = useRevisionRestore({
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
  });

  const showUnpublished =
    unpublished && (chapter.status === 'published' || chapter.status === 'scheduled');

  const applyRestore = () => {
    if (editor && restore) {
      // A normal update: autosave sends it on top of the current server version.
      editor.commands.setContent(restore.doc);
      editor.commands.focus('end');
    }
    setRestore(null);
  };

  const discardRestore = () => {
    mirrorRef.current?.cancel();
    clearMirror(browserStorage(), mirrorKey(publicId, number));
    setRestore(null);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <EditorHeader
        editor={editor}
        publicId={publicId}
        number={number}
        chapter={chapter}
        showUnpublished={showUnpublished}
        status={status}
        words={words}
        focus={focus}
        onFocusChange={setFocus}
        publishing={publishing}
        dialogError={publishError?.from === 'dialog' ? publishError.message : null}
        onPublish={publishNow}
        onSchedule={schedule}
        onRestore={restoreRevision}
      />

      <main className="mx-auto flex w-full max-w-[680px] grow flex-col gap-6 px-4 pt-8 pb-20 md:pb-16">
        <EditorBanners
          status={status}
          resolving={resolving}
          resolveError={resolveError}
          onResolve={(keepMine) => void resolveConflict(keepMine)}
          chapter={chapter}
          publishing={publishing}
          onUnschedule={() => void unschedule()}
          onReschedule={() => void schedule(new Date(chapter.scheduledAt ?? ''), 'banner')}
          notice={notice}
          bannerError={publishError?.from === 'banner' ? publishError.message : null}
          restore={restore}
          onApplyRestore={applyRestore}
          onDiscardRestore={discardRestore}
        />
        {focus ? null : (
          <div className="flex flex-col gap-1">
            <ChapterMetaField
              kind="title"
              publicId={publicId}
              number={number}
              initial={draft.chapter.title}
            />
            {/* On a phone the word count and the unpublished pill leave the header for this line. */}
            {isDesktop ? null : (
              <MobileChapterMeta words={words} showUnpublished={showUnpublished} />
            )}
          </div>
        )}
        <EditorContent
          editor={editor}
          className="grow font-serif text-[18px] leading-[1.85] md:text-[20px]"
        />
        {focus ? null : (
          <ChapterMetaField
            kind="authorNote"
            publicId={publicId}
            number={number}
            initial={draft.chapter.authorNote}
          />
        )}
      </main>
    </div>
  );
}
