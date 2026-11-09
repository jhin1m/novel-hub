import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { ChapterTocControls, useChapterTocState, useHydrated } from '../toc/chapter-toc-controls';

interface ChapterItem {
  number: number;
  title: string | null;
}

/** Id of a chapter link, the target of "go to the chapter I'm reading". */
const CHAPTER_ID_PREFIX = 'toc-chapter-';

/**
 * Table of contents of a public story: every readable chapter in a grid of plain document links,
 * with the newest one pinned above when there are several. `currentNumber` marks the chapter the
 * reader is on; it is only known in the browser, so the server always renders it as `null`.
 * Search, order and jump controls appear once hydrated; the server HTML is the plain list.
 */
export function StoryChapterList({
  story,
  chapters,
  currentNumber,
}: {
  story: { slug: string; publicId: string };
  chapters: ChapterItem[];
  currentNumber: number | null;
}) {
  const hydrated = useHydrated();
  const toc = useChapterTocState(chapters, currentNumber, CHAPTER_ID_PREFIX);
  return (
    <StoryChapterListView
      story={story}
      chapters={chapters}
      visible={toc.visible}
      filtering={toc.filtering}
      currentNumber={currentNumber}
      controls={hydrated && chapters.length >= 2 ? <ChapterTocControls {...toc.controls} /> : null}
    />
  );
}

/**
 * The list itself, for a given search result: `visible` are the chapters to list, in order;
 * `filtering` hides the pinned newest chapter while a search is typed.
 */
export function StoryChapterListView({
  story,
  chapters,
  visible,
  filtering,
  currentNumber,
  controls,
}: {
  story: { slug: string; publicId: string };
  chapters: ChapterItem[];
  visible: ChapterItem[];
  filtering: boolean;
  currentNumber: number | null;
  controls: ReactNode;
}) {
  if (chapters.length === 0) {
    return <p className="text-muted-foreground">{m.story_page_toc_empty()}</p>;
  }
  const href = (number: number) => canonicalPath({ kind: 'chapter', ...story, number });
  const latest = chapters.length >= 2 && !filtering ? chapters[chapters.length - 1] : undefined;
  return (
    <div className="flex flex-col gap-3">
      {controls}
      {latest ? (
        <a
          href={href(latest.number)}
          className="flex min-w-0 items-center gap-3 rounded-2xl bg-primary-soft px-4 py-3 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
            {m.story_page_toc_latest()}
          </span>
          <span className="min-w-0 truncate font-semibold">{chapterLabel(latest)}</span>
        </a>
      ) : null}
      {visible.length > 0 ? (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-x-7">
          {visible.map((chapter) => {
            const current = chapter.number === currentNumber;
            return (
              <li key={chapter.number} className="border-b border-band">
                <a
                  id={`${CHAPTER_ID_PREFIX}${chapter.number}`}
                  href={href(chapter.number)}
                  className={cn(
                    'flex min-w-0 items-baseline gap-2.5 rounded-sm px-1 py-[13px] underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring',
                    current && 'bg-primary-soft',
                  )}
                >
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {m.reader_chapter_label({ number: chapter.number })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                  {current ? (
                    <span className="shrink-0 text-xs font-bold text-primary">
                      {m.reader_toc_current()}
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/** "Chương N · title", or "Chương N" for an untitled chapter. */
function chapterLabel(chapter: ChapterItem): string {
  const label = m.reader_chapter_label({ number: chapter.number });
  return chapter.title ? `${label} · ${chapter.title}` : label;
}
