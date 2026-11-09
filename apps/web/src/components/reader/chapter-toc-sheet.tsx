import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useQuery } from '@tanstack/react-query';
import type { RefObject } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePanelTrigger } from '@/lib/reader/use-panel-trigger';
import { cn } from '@/lib/utils';
import type { TocChapter } from '@/lib/toc';
import { getChapterToc } from '../../server-fns/reader';
import { ChapterTocControls, useChapterTocState } from '../toc/chapter-toc-controls';

/** Differs from the story page's ids, though the two lists never share a page. */
const CHAPTER_ID_PREFIX = 'reader-toc-chapter-';

interface StoryRef {
  slug: string;
  publicId: string;
  title: string;
}

/**
 * Table of contents: a bottom sheet on small screens, a left-hand panel from `lg` up; fetched the
 * first time it opens. Opened from the reading controls (`trigger`), which hold the open state.
 */
export function ChapterTocSheet({
  story,
  current,
  open,
  onOpenChange,
  trigger,
}: {
  story: StoryRef;
  current: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: RefObject<HTMLButtonElement | null>;
}) {
  const panelFocus = usePanelTrigger(trigger, true);
  const toc = useQuery({
    queryKey: ['chapter-toc', story.publicId],
    queryFn: () => getChapterToc({ data: { publicId: story.publicId } }),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="adaptive-left" className="gap-0" {...panelFocus}>
        <SheetHeader className="pr-12">
          <SheetTitle className="text-lg font-extrabold">{m.reader_toc()}</SheetTitle>
          <SheetDescription asChild>
            {/* Full page load: the story page is public, cached HTML. */}
            <a
              href={canonicalPath({ kind: 'story', ...story })}
              className="underline-offset-4 hover:underline"
            >
              {m.reader_toc_story()}: {story.title}
            </a>
          </SheetDescription>
        </SheetHeader>
        {toc.isPending ? (
          <p className="px-4 text-sm text-muted-foreground">{m.reader_toc_loading()}</p>
        ) : toc.isError || toc.data === null ? (
          <p className="px-4 text-sm text-muted-foreground">{m.reader_toc_error()}</p>
        ) : (
          <TocList story={story} chapters={toc.data} current={current} />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Controls and links of the loaded table of contents. Mounted with the open panel, so the search
 * and order start over each time it opens.
 */
function TocList({
  story,
  chapters,
  current,
}: {
  story: StoryRef;
  chapters: TocChapter[];
  current: number;
}) {
  const list = useChapterTocState(chapters, current, CHAPTER_ID_PREFIX);
  return (
    <>
      {chapters.length >= 2 ? (
        <div className="px-4 pb-3">
          <ChapterTocControls {...list.controls} />
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {list.visible.length > 0 ? (
          <ol className="flex flex-col">
            {list.visible.map((chapter) => {
              const isCurrent = chapter.number === current;
              return (
                <li key={chapter.number}>
                  <a
                    id={`${CHAPTER_ID_PREFIX}${chapter.number}`}
                    href={canonicalPath({ kind: 'chapter', ...story, number: chapter.number })}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-accent',
                      isCurrent &&
                        'bg-primary-soft font-semibold text-primary hover:bg-primary-soft',
                    )}
                  >
                    <span className="shrink-0">
                      {m.reader_chapter_label({ number: chapter.number })}
                    </span>
                    {chapter.title ? <span className="truncate">{chapter.title}</span> : null}
                    {isCurrent ? <span className="sr-only">({m.reader_toc_current()})</span> : null}
                  </a>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </>
  );
}
