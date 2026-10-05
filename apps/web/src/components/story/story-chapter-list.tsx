import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { cn } from '../../lib/utils';

interface ChapterItem {
  number: number;
  title: string | null;
}

/**
 * Table of contents of a public story: every readable chapter in a grid of plain document links,
 * with the newest one pinned above when there are several. `currentNumber` marks the chapter the
 * reader is on; it is only known in the browser, so the server always renders it as `null`.
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
  if (chapters.length === 0) {
    return <p className="text-muted-foreground">{m.story_page_toc_empty()}</p>;
  }
  const href = (number: number) => canonicalPath({ kind: 'chapter', ...story, number });
  const latest = chapters.length >= 2 ? chapters[chapters.length - 1] : undefined;
  return (
    <div className="flex flex-col gap-3">
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
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-1">
        {chapters.map((chapter) => {
          const current = chapter.number === currentNumber;
          return (
            <li key={chapter.number}>
              <a
                href={href(chapter.number)}
                className={cn(
                  'flex min-w-0 items-baseline gap-2.5 rounded-xl px-3 py-2.5 outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring',
                  current && 'bg-primary-soft hover:bg-primary-soft',
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
    </div>
  );
}

/** "Chương N · title", or "Chương N" for an untitled chapter. */
function chapterLabel(chapter: ChapterItem): string {
  const label = m.reader_chapter_label({ number: chapter.number });
  return chapter.title ? `${label} · ${chapter.title}` : label;
}
