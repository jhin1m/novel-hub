import { m } from '@novel-hub/shared/messages';
import { formatDate, formatDecimal } from '@/lib/format';
import { chapterHeading } from '@/lib/reader/chapter-heading';

/**
 * Top of the chapter: "Chương N" pill (titled chapters only, outside the heading), the heading in
 * the story typeface, then word count and publish date.
 */
export function ChapterHeader({
  chapter,
}: {
  chapter: { number: number; title: string | null; wordCount: number; publishedAt: Date | string };
}) {
  const { heading, label } = chapterHeading(chapter);
  return (
    <header className="mb-10 flex flex-col gap-3 font-sans">
      {label ? (
        <p className="self-start rounded-full bg-reader-card px-3 py-1 text-xs font-bold text-reader-muted">
          {label}
        </p>
      ) : null}
      {/* Focus target once the 18+ screen goes away. */}
      <h1
        tabIndex={-1}
        className="font-serif text-[30px] leading-tight font-bold text-balance outline-none lg:text-[40px]"
      >
        {heading}
      </h1>
      <p className="text-[13px] text-reader-muted">
        {m.reader_chapter_meta({
          words: formatDecimal(chapter.wordCount),
          // The server function may hand over a `Date` or its ISO string.
          date: formatDate(new Date(chapter.publishedAt).toISOString()),
        })}
      </p>
    </header>
  );
}
