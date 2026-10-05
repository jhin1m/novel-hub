import { LIMITS, countWords, docToText, type EditorDocJson } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { editorExtensions } from '@novel-hub/shared/editor';
import { Link } from '@tanstack/react-router';
import { EditorContent, useEditor } from '@tiptap/react';
import { ArrowLeft } from 'lucide-react';
import { type FocusEvent, useEffect, useId, useRef, useState } from 'react';
import { FormMessage } from '@/components/auth-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api-errors';
import { type Autosave, type SaveStatus, createAutosave } from '@/lib/autosave';
import { type DraftView, fetchDraft, saveDraftRequest, useUpdateChapterMeta } from '@/lib/chapters';
import {
  type DraftMirror,
  browserStorage,
  clearMirror,
  createMirrorWriter,
  mirrorKey,
  readMirror,
  sameDoc,
} from '@/lib/draft-mirror';
import { cn } from '@/lib/utils';
import { ConflictBanner } from './conflict-banner';
import { DraftRestoreBanner } from './draft-restore-banner';
import { EditorToolbar } from './editor-toolbar';
import { FocusToggle, useFocusMode } from './focus-toggle';
import { SaveStatusText } from './save-status';

const WORD_COUNT_DELAY_MS = 500;

const wordsOf = (doc: EditorDocJson) => countWords(docToText(doc));

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
  // The route renders only in the browser, so local storage is readable on the first render.
  const [restore, setRestore] = useState<DraftMirror | null>(() => {
    const saved = readMirror(browserStorage(), mirrorKey(publicId, number));
    return saved && !sameDoc(saved.doc, draft.doc) ? saved : null;
  });
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(false);
  // The draft as loaded; later refetches must not rebuild autosave on a version it never saw.
  const loadedRef = useRef(draft);
  const autosaveRef = useRef<Autosave | null>(null);
  const mirrorRef = useRef<ReturnType<typeof createMirrorWriter> | null>(null);

  const editor = useEditor({
    extensions: editorExtensions,
    content: draft.doc,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'chapter-editor-content',
        'aria-label': m.editor_content_label(),
        'aria-multiline': 'true',
        role: 'textbox',
      },
    },
  });

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
  }, [editor, publicId, number]);

  const resolveConflict = async (keepMine: boolean) => {
    const autosave = autosaveRef.current;
    if (!editor || !autosave) return;
    setResolving(true);
    setResolveError(false);
    try {
      const latest = await fetchDraft(publicId, number);
      if (keepMine) {
        autosave.rebase(latest.updatedAt, JSON.stringify(latest.doc));
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
      {focus ? (
        <div className="fixed top-2 right-2 z-10 flex items-center gap-2">
          <SaveStatusText status={status} className="opacity-60" />
          <FocusToggle focus={focus} onChange={setFocus} />
        </div>
      ) : (
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
            <Link
              to="/write/stories/$publicId"
              params={{ publicId }}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              {m.editor_back()}
            </Link>
            <span className="text-sm font-medium">
              {m.editor_chapter_heading({ number: String(number) })}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <SaveStatusText status={status} />
              <span className="text-xs text-muted-foreground">
                {m.editor_word_count({ count: words.toLocaleString('vi-VN') })}
              </span>
              <FocusToggle focus={focus} onChange={setFocus} />
            </div>
          </div>
          {editor ? (
            <div className="mx-auto max-w-4xl px-4 pb-2">
              <EditorToolbar editor={editor} />
            </div>
          ) : null}
        </header>
      )}

      <main className="mx-auto flex w-full max-w-[70ch] grow flex-col gap-6 px-4 py-8">
        {status.kind === 'conflict' ? (
          <ConflictBanner
            pending={resolving}
            onLoadLatest={() => void resolveConflict(false)}
            onKeepMine={() => void resolveConflict(true)}
          />
        ) : null}
        {resolveError ? <FormMessage>{m.editor_action_failed()}</FormMessage> : null}
        {restore && status.kind !== 'conflict' ? (
          <DraftRestoreBanner
            savedAt={restore.savedAt}
            onRestore={applyRestore}
            onDiscard={discardRestore}
          />
        ) : null}

        {focus ? null : (
          <ChapterMetaField
            kind="title"
            publicId={publicId}
            number={number}
            initial={draft.chapter.title}
          />
        )}
        <EditorContent editor={editor} className="grow font-serif text-lg leading-[1.85]" />
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

/**
 * Title or author note, saved on blur when changed. Plain text: shown through React, so it is
 * escaped on display.
 */
function ChapterMetaField({
  kind,
  publicId,
  number,
  initial,
}: {
  kind: 'title' | 'authorNote';
  publicId: string;
  number: number;
  initial: string | null;
}) {
  const id = useId();
  const update = useUpdateChapterMeta(publicId, number);
  const savedRef = useRef(initial ?? '');
  const [value, setValue] = useState(initial ?? '');

  const onBlur = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = event.currentTarget.value.trim();
    if (next === savedRef.current) return;
    update.mutate(
      { [kind]: next === '' ? null : next },
      {
        onSuccess: (chapter) => {
          savedRef.current = chapter[kind] ?? '';
        },
      },
    );
  };

  const error = update.isError ? <FormMessage>{apiErrorMessage(update.error)}</FormMessage> : null;

  if (kind === 'title') {
    return (
      <div className="flex flex-col gap-1">
        <Label htmlFor={id} className="sr-only">
          {m.editor_title_label()}
        </Label>
        <Input
          id={id}
          value={value}
          maxLength={LIMITS.chapterTitleMax}
          placeholder={m.editor_title_placeholder()}
          onChange={(e) => setValue(e.target.value)}
          onBlur={onBlur}
          className={cn(
            'h-auto border-0 px-0 font-serif text-2xl font-semibold shadow-none md:text-2xl',
            'focus-visible:ring-0 dark:bg-transparent',
          )}
        />
        {error}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t pt-6">
      <Label htmlFor={id}>{m.editor_author_note_label()}</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={LIMITS.authorNoteMax}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {m.editor_author_note_hint()}
      </p>
      {error}
    </div>
  );
}
