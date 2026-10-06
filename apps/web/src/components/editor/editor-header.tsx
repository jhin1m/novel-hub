import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import type { Editor } from '@tiptap/react';
import { ArrowLeft } from 'lucide-react';
import { CHAPTER_STATUS_LABELS } from '@/components/story/story-labels';
import { Badge } from '@/components/ui/badge';
import type { SaveStatus } from '@/lib/autosave';
import type { AuthorChapterView, RevisionSummary } from '@/lib/chapters';
import { EditorToolbar } from './editor-toolbar';
import { FocusToggle } from './focus-toggle';
import { PublishDialog } from './publish-dialog';
import { RevisionHistorySheet } from './revision-history-sheet';
import { SaveStatusText } from './save-status';

/** Top of the chapter editor: the full header with toolbar, or a corner control in focus mode. */
export function EditorHeader({
  editor,
  publicId,
  number,
  chapter,
  showUnpublished,
  status,
  words,
  focus,
  onFocusChange,
  publishing,
  dialogError,
  onPublish,
  onSchedule,
  onRestore,
}: {
  editor: Editor | null;
  publicId: string;
  number: number;
  chapter: AuthorChapterView;
  showUnpublished: boolean;
  status: SaveStatus;
  words: number;
  focus: boolean;
  onFocusChange: (v: boolean) => void;
  publishing: boolean;
  dialogError: string | null;
  onPublish: () => Promise<boolean>;
  onSchedule: (at: Date) => Promise<boolean>;
  onRestore: (revision: RevisionSummary) => Promise<string | null>;
}) {
  return focus ? (
    <div className="fixed top-2 right-2 z-10 flex items-center gap-2">
      <SaveStatusText status={status} className="opacity-60" />
      <FocusToggle focus={focus} onChange={onFocusChange} />
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
        <Badge variant={chapter.status === 'published' ? 'default' : 'secondary'}>
          {CHAPTER_STATUS_LABELS[chapter.status]()}
        </Badge>
        {showUnpublished ? (
          <Badge variant="outline">{m.publish_unpublished_changes()}</Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <SaveStatusText status={status} />
          <span className="text-xs text-muted-foreground">
            {m.editor_word_count({ count: words.toLocaleString('vi-VN') })}
          </span>
          <RevisionHistorySheet publicId={publicId} number={number} onRestore={onRestore} />
          <PublishDialog
            number={number}
            status={chapter.status}
            words={words}
            pending={publishing}
            error={dialogError}
            onPublish={onPublish}
            onSchedule={onSchedule}
          />
          <FocusToggle focus={focus} onChange={onFocusChange} />
        </div>
      </div>
      {editor ? (
        <div className="mx-auto max-w-4xl px-4 pb-2">
          <EditorToolbar editor={editor} />
        </div>
      ) : null}
    </header>
  );
}
