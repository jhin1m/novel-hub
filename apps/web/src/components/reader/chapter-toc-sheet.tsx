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
import { getChapterToc } from '../../server-fns/reader';

interface StoryRef {
  slug: string;
  publicId: string;
  title: string;
}

/**
 * Table of contents in a side sheet, fetched the first time it opens. Opened from the reading
 * controls (`trigger`), which hold the open state.
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
      <SheetContent side="left" className="gap-0" {...panelFocus}>
        <SheetHeader>
          <SheetTitle>{m.reader_toc()}</SheetTitle>
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
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {toc.isPending ? (
            <p className="px-2 text-sm text-muted-foreground">{m.reader_toc_loading()}</p>
          ) : toc.isError || toc.data === null ? (
            <p className="px-2 text-sm text-muted-foreground">{m.reader_toc_error()}</p>
          ) : (
            <ol className="flex flex-col">
              {toc.data.map((chapter) => {
                const isCurrent = chapter.number === current;
                return (
                  <li key={chapter.number}>
                    <a
                      href={canonicalPath({ kind: 'chapter', ...story, number: chapter.number })}
                      aria-current={isCurrent ? 'page' : undefined}
                      className={cn(
                        'flex gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent',
                        isCurrent && 'font-semibold text-primary',
                      )}
                    >
                      <span className="shrink-0">
                        {m.reader_chapter_label({ number: chapter.number })}
                      </span>
                      {chapter.title ? <span className="truncate">{chapter.title}</span> : null}
                      {isCurrent ? (
                        <span className="sr-only">({m.reader_toc_current()})</span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
