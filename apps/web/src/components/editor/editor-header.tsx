import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import type { Editor } from '@tiptap/react';
import { ArrowLeft } from 'lucide-react';
import { ChapterStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import type { SaveStatus } from '@/lib/autosave';
import type { AuthorChapterView, RevisionSummary } from '@/lib/chapters';
import { useMyStory } from '@/lib/stories';
import { useMediaQuery } from '@/lib/use-media-query';
import { DESKTOP_QUERY, wordCountText } from './chapter-editor-helpers';
import { EditorToolbar } from './editor-toolbar';
import { FocusToggle } from './focus-toggle';
import { PublishDialog } from './publish-dialog';
import { RevisionHistorySheet } from './revision-history-sheet';
import { SaveStatusText } from './save-status';

/*
 * One node per item, placed by grid areas: two rows on a phone (status under the chapter heading),
 * one row from `md` up. Tests find texts by content, so nothing is rendered twice and hidden: on a
 * phone the word count and the unpublished pill move to `MobileChapterMeta` instead.
 */
const HEADER_GRID =
  'grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 px-3 ' +
  "[grid-template-areas:'back_title_actions'_'back_status_actions'] " +
  'md:h-[68px] md:grid-cols-[auto_minmax(0,auto)_minmax(0,1fr)_auto_auto_auto] md:gap-x-4 md:px-6 ' +
  "md:[grid-template-areas:'back_title_pill_status_words_actions']";

function UnpublishedPill({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={className}>
      {m.publish_unpublished_changes()}
    </Badge>
  );
}

/** Phone-only meta line under the chapter title, like the one on the reading page. */
export function MobileChapterMeta({
  words,
  showUnpublished,
}: {
  words: number;
  showUnpublished: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>{wordCountText(words)}</span>
      {showUnpublished ? <UnpublishedPill /> : null}
    </div>
  );
}

/** Top of the chapter editor: header and toolbar, or a corner control in focus mode. */
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
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const storyTitle = useMyStory(publicId).data?.title;

  if (focus) {
    return (
      <div className="fixed top-3 right-3 z-10 flex items-center gap-2">
        <SaveStatusText status={status} className="opacity-60" />
        <FocusToggle focus={focus} onChange={onFocusChange} />
      </div>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className={HEADER_GRID}>
          <Link
            to="/write/stories/$publicId"
            params={{ publicId }}
            aria-label={isDesktop ? undefined : m.editor_back()}
            className="inline-flex size-9 items-center justify-center gap-1 rounded-full text-sm text-muted-foreground [grid-area:back] hover:text-foreground md:size-auto"
          >
            <ArrowLeft className="size-4 shrink-0" />
            {isDesktop ? m.editor_back() : null}
          </Link>

          <div className="flex min-w-0 flex-col justify-center [grid-area:title]">
            {isDesktop && storyTitle ? (
              <span className="truncate text-xs text-muted-foreground">{storyTitle}</span>
            ) : null}
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-bold">
                {m.editor_chapter_heading({ number: String(number) })}
              </span>
              <ChapterStatusBadge status={chapter.status} />
            </div>
          </div>

          {isDesktop && showUnpublished ? (
            <UnpublishedPill className="justify-self-start [grid-area:pill]" />
          ) : null}

          <SaveStatusText status={status} className="min-w-0 [grid-area:status]" />

          {isDesktop ? (
            <span className="text-xs whitespace-nowrap text-muted-foreground [grid-area:words]">
              {wordCountText(words)}
            </span>
          ) : null}

          <div className="flex items-center gap-1 [grid-area:actions] md:gap-2">
            <RevisionHistorySheet publicId={publicId} number={number} onRestore={onRestore} />
            <FocusToggle focus={focus} onChange={onFocusChange} />
            <PublishDialog
              number={number}
              status={chapter.status}
              words={words}
              pending={publishing}
              error={dialogError}
              onPublish={onPublish}
              onSchedule={onSchedule}
            />
          </div>
        </div>
      </header>
      {editor ? <EditorToolbar editor={editor} /> : null}
    </>
  );
}
